import { Component, Input, Output, EventEmitter, OnDestroy, HostListener, NgZone, ElementRef, ViewChild } from '@angular/core';

export interface PianoNote {
  id: number;
  midi: number;
  noteName: string;
  startTime: number;
  duration: number;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10]);

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToName(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

// QWERTY → MIDI mapping (2 octaves: C3=48 … C5=72)
const KEY_MAP: Record<string, number> = {
  'z':48,'s':49,'x':50,'d':51,'c':52,'v':53,'g':54,'b':55,'h':56,'n':57,'j':58,'m':59,
  'q':60,'2':61,'w':62,'3':63,'e':64,'r':65,'5':66,'t':67,'6':68,'y':69,'7':70,'u':71,
  'i':72,
};

const NOTE_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4'];

interface ActiveNote {
  oscs: OscillatorNode[];
  gains: GainNode[];
  masterGain: GainNode;
  noiseSource?: AudioBufferSourceNode;
  startCtxTime: number;
  noteObj: PianoNote;
}

// Build white noise buffer (reused across all notes)
function makeNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

@Component({
  selector: 'app-piano-roll',
  standalone: false,
  templateUrl: './piano-roll.html',
  styleUrl: './piano-roll.css',
})
export class PianoRoll implements OnDestroy {
  @Input() playheadTime = 0;
  @Output() addTrack = new EventEmitter<{ url: string; nombre: string }>();
  @Output() seekTo = new EventEmitter<number>();
  @ViewChild('scrollEl') scrollEl!: ElementRef<HTMLDivElement>;

  readonly pxPerSecond = 80;
  readonly ROW_H = 20;
  readonly LABEL_W = 88;
  readonly MIDI_MIN = 48; // C3
  readonly MIDI_MAX = 72; // C5

  notes: PianoNote[] = [];
  isRecording = false;
  isExporting = false;
  cursorTime: number | null = null; // mouse hover time on timeline

  private noteId = 0;
  private audioCtx: AudioContext | null = null;
  private activeNotes = new Map<number, ActiveNote>();
  private recordingCtxStart = 0;
  private recordingTimelineStart = 0;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(private zone: NgZone) {}

  // ---- MIDI range (top=high, bottom=low) ----
  get midiRange(): number[] {
    const range: number[] = [];
    for (let m = this.MIDI_MAX; m >= this.MIDI_MIN; m--) range.push(m);
    return range;
  }

  get timelineWidth(): number {
    const maxEnd = this.notes.reduce((mx, n) => Math.max(mx, n.startTime + n.duration), 10);
    return (maxEnd + 3) * this.pxPerSecond;
  }

  isBlack(midi: number): boolean { return BLACK_OFFSETS.has(midi % 12); }
  isC(midi: number): boolean { return midi % 12 === 0; }
  noteName(midi: number): string { return midiToName(midi); }
  noteColor(midi: number): string { return NOTE_COLORS[Math.floor(midi / 12) % NOTE_COLORS.length]; }
  isActive(midi: number): boolean { return this.activeNotes.has(midi); }

  notesForMidi(midi: number): PianoNote[] {
    return this.notes.filter(n => n.midi === midi && n.duration > 0);
  }

  noteWidth(note: PianoNote): number {
    return Math.max(6, note.duration * this.pxPerSecond);
  }

  // ---- TIMELINE MOUSE NAVIGATION ----
  onLaneClick(event: MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left + el.scrollLeft - this.LABEL_W;
    if (x < 0) return;
    const t = x / this.pxPerSecond;
    this.playheadTime = t;
    this.seekTo.emit(t);
  }

  onLaneMouseMove(event: MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left + el.scrollLeft - this.LABEL_W;
    this.cursorTime = x >= 0 ? x / this.pxPerSecond : null;
  }

  onLaneMouseLeave() {
    this.cursorTime = null;
  }

  // ---- KEYBOARD ----
  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const midi = KEY_MAP[e.key.toLowerCase()];
    if (midi !== undefined && !this.activeNotes.has(midi)) this.playNote(midi);
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    const midi = KEY_MAP[e.key.toLowerCase()];
    if (midi !== undefined) this.stopNote(midi);
  }

  // ---- NOTE PLAY (improved multi-harmonic piano) ----
  playNote(midi: number) {
    if (this.activeNotes.has(midi)) return;
    const ctx = this.getCtx();
    const freq = midiToFreq(midi);
    const now = ctx.currentTime;

    // Master output gain (controls overall volume + release)
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(1.0, now + 0.005);
    masterGain.connect(ctx.destination);

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    // Harmonic series: [multiplier, peak, sustainLevel, decayTime]
    const harmonics: [number, number, number, number][] = [
      [1.000, 0.50, 0.28, 0.30],  // fundamental (slightly inharmonic piano: exactly 1)
      [2.001, 0.22, 0.07, 0.20],  // 2nd partial
      [3.003, 0.12, 0.03, 0.12],  // 3rd partial
      [4.006, 0.06, 0.01, 0.08],  // 4th partial
      [5.010, 0.03, 0.005, 0.05], // 5th partial
      [6.015, 0.015, 0.001, 0.04],// 6th partial
    ];

    for (const [mult, peak, sustain, decayT] of harmonics) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = mult === harmonics[0][0] ? 'triangle' : 'sine';
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.004);
      g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.001), now + decayT);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(now);
      oscs.push(osc);
      gains.push(g);
    }

    // Hammer noise burst (brief filtered click for attack)
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = Math.min(freq * 3, 8000);
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + 0.04);

    const startTime = this.isRecording
      ? this.recordingTimelineStart + (now - this.recordingCtxStart)
      : 0;

    const noteObj: PianoNote = {
      id: ++this.noteId,
      midi,
      noteName: midiToName(midi),
      startTime,
      duration: 0,
    };

    this.activeNotes.set(midi, { oscs, gains, masterGain, noiseSource, startCtxTime: now, noteObj });

    if (this.isRecording) {
      this.zone.run(() => { this.notes = [...this.notes, noteObj]; });
    }
  }

  stopNote(midi: number) {
    const active = this.activeNotes.get(midi);
    if (!active) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // Smooth release on master gain
    active.masterGain.gain.cancelScheduledValues(now);
    active.masterGain.gain.setValueAtTime(active.masterGain.gain.value, now);
    active.masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    active.oscs.forEach(o => o.stop(now + 0.6));

    if (this.isRecording) {
      const dur = now - active.startCtxTime;
      active.noteObj.duration = Math.max(0.05, dur);
      this.zone.run(() => { this.notes = [...this.notes]; });
    }

    this.activeNotes.delete(midi);
  }

  // ---- RECORDING ----
  startRecording() {
    const ctx = this.getCtx();
    this.recordingCtxStart = ctx.currentTime;
    this.recordingTimelineStart = this.playheadTime;
    this.notes = [];
    this.isRecording = true;
  }

  stopRecording() {
    const midis = [...this.activeNotes.keys()];
    midis.forEach(m => this.stopNote(m));
    this.isRecording = false;
  }

  clearNotes() {
    const midis = [...this.activeNotes.keys()];
    midis.forEach(m => this.stopNote(m));
    this.notes = [];
  }

  // ---- EXPORT TO AUDIO TRACK ----
  async exportToTrack() {
    if (!this.notes.length) return;
    this.isExporting = true;
    try {
      const validNotes = this.notes.filter(n => n.duration > 0);
      const totalDur = Math.max(...validNotes.map(n => n.startTime + n.duration)) + 1.0;
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(2, Math.ceil(totalDur * sampleRate), sampleRate);

      // Noise buffer for offline context
      const offNoiseLen = Math.ceil(0.05 * sampleRate);
      const offNoiseBuf = offline.createBuffer(1, offNoiseLen, sampleRate);
      const offNoiseData = offNoiseBuf.getChannelData(0);
      for (let i = 0; i < offNoiseLen; i++) offNoiseData[i] = Math.random() * 2 - 1;

      for (const note of validNotes) {
        const freq = midiToFreq(note.midi);
        const t = note.startTime;
        const releaseT = t + note.duration;

        const masterGain = offline.createGain();
        masterGain.gain.setValueAtTime(0.001, t);
        masterGain.gain.linearRampToValueAtTime(1.0, t + 0.005);
        masterGain.gain.setValueAtTime(1.0, releaseT);
        masterGain.gain.exponentialRampToValueAtTime(0.001, releaseT + 0.55);
        masterGain.connect(offline.destination);

        const harmonics: [number, number, number, number][] = [
          [1.000, 0.50, 0.28, 0.30],
          [2.001, 0.22, 0.07, 0.20],
          [3.003, 0.12, 0.03, 0.12],
          [4.006, 0.06, 0.01, 0.08],
          [5.010, 0.03, 0.005, 0.05],
          [6.015, 0.015, 0.001, 0.04],
        ];

        for (const [mult, peak, sustain, decayT] of harmonics) {
          const osc = offline.createOscillator();
          const g = offline.createGain();
          osc.type = mult === 1.000 ? 'triangle' : 'sine';
          osc.frequency.value = freq * mult;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(peak, t + 0.004);
          g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.001), t + decayT);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(t);
          osc.stop(releaseT + 0.6);
        }

        // Hammer noise
        const noiseSource = offline.createBufferSource();
        noiseSource.buffer = offNoiseBuf;
        const noiseFilter = offline.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = Math.min(freq * 3, 8000);
        noiseFilter.Q.value = 0.8;
        const noiseGain = offline.createGain();
        noiseGain.gain.setValueAtTime(0.18, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noiseSource.start(t);
        noiseSource.stop(t + 0.04);
      }

      const rendered = await offline.startRendering();
      const wav = this.bufferToWav(rendered);
      const url = URL.createObjectURL(wav);
      this.zone.run(() => {
        this.isExporting = false;
        this.addTrack.emit({ url, nombre: 'Piano Roll' });
      });
    } catch {
      this.zone.run(() => { this.isExporting = false; });
    }
  }

  private bufferToWav(buffer: AudioBuffer): Blob {
    const numCh = buffer.numberOfChannels;
    const data = buffer.getChannelData(0);
    const ab = new ArrayBuffer(44 + data.length * 2);
    const v = new DataView(ab);
    const sr = buffer.sampleRate;
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0,'RIFF'); v.setUint32(4, 36 + data.length*2, true);
    ws(8,'WAVE'); ws(12,'fmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true);
    v.setUint16(34,16,true); ws(36,'data'); v.setUint32(40,data.length*2,true);
    let off = 44;
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  private getCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext();
      this.noiseBuffer = null;
    }
    return this.audioCtx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      this.noiseBuffer = makeNoiseBuffer(ctx, 0.05);
    }
    return this.noiseBuffer;
  }

  ngOnDestroy() {
    [...this.activeNotes.keys()].forEach(m => this.stopNote(m));
    this.audioCtx?.close();
  }
}
