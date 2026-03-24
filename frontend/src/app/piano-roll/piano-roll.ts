import { Component, Input, Output, EventEmitter, OnDestroy, HostListener, NgZone } from '@angular/core';

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
  // Octave 3 (C3–B3): white=Z X C V B N M, black=S D G H J
  'z':48,'s':49,'x':50,'d':51,'c':52,'v':53,'g':54,'b':55,'h':56,'n':57,'j':58,'m':59,
  // Octave 4 (C4–B4): white=Q W E R T Y U, black=2 3 5 6 7
  'q':60,'2':61,'w':62,'3':63,'e':64,'r':65,'5':66,'t':67,'6':68,'y':69,'7':70,'u':71,
  'i':72, // C5
};

const NOTE_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4'];

@Component({
  selector: 'app-piano-roll',
  standalone: false,
  templateUrl: './piano-roll.html',
  styleUrl: './piano-roll.css',
})
export class PianoRoll implements OnDestroy {
  @Input() playheadTime = 0;
  @Output() addTrack = new EventEmitter<{ url: string; nombre: string }>();

  readonly pxPerSecond = 80;
  readonly ROW_H = 20;
  readonly LABEL_W = 88;
  readonly MIDI_MIN = 48; // C3
  readonly MIDI_MAX = 72; // C5

  notes: PianoNote[] = [];
  isRecording = false;
  isExporting = false;

  private noteId = 0;
  private audioCtx: AudioContext | null = null;
  private activeNotes = new Map<number, { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; startCtxTime: number; noteObj: PianoNote }>();
  private recordingCtxStart = 0;
  private recordingTimelineStart = 0;

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

  // ---- NOTE PLAY / STOP ----
  playNote(midi: number) {
    if (this.activeNotes.has(midi)) return;
    const ctx = this.getCtx();
    const freq = midiToFreq(midi);
    const now = ctx.currentTime;

    // Oscillator 1: triangle (fundamental)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.006);   // Attack
    gain.gain.exponentialRampToValueAtTime(0.45, now + 0.18); // Decay
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);

    // Oscillator 2: sine (2nd harmonic, quieter)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.006);
    gain2.gain.exponentialRampToValueAtTime(0.05, now + 0.15);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);

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

    this.activeNotes.set(midi, { osc, osc2, gain, startCtxTime: now, noteObj });

    if (this.isRecording) {
      this.zone.run(() => { this.notes = [...this.notes, noteObj]; });
    }
  }

  stopNote(midi: number) {
    const active = this.activeNotes.get(midi);
    if (!active) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // Release
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setValueAtTime(active.gain.gain.value, now);
    active.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    active.osc.stop(now + 0.45);
    active.osc2.stop(now + 0.45);

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
      const totalDur = Math.max(...validNotes.map(n => n.startTime + n.duration)) + 0.6;
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(1, Math.ceil(totalDur * sampleRate), sampleRate);

      for (const note of validNotes) {
        const freq = midiToFreq(note.midi);
        const t = note.startTime;

        const osc = offline.createOscillator();
        const gain = offline.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.6, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.38, t + 0.18);
        const releaseT = t + note.duration;
        gain.gain.setValueAtTime(0.38, releaseT);
        gain.gain.exponentialRampToValueAtTime(0.001, releaseT + 0.45);
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(t);
        osc.stop(releaseT + 0.5);

        // 2nd harmonic
        const osc2 = offline.createOscillator();
        const gain2 = offline.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2;
        gain2.gain.setValueAtTime(0, t);
        gain2.gain.linearRampToValueAtTime(0.1, t + 0.006);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + note.duration + 0.3);
        osc2.connect(gain2);
        gain2.connect(offline.destination);
        osc2.start(t);
        osc2.stop(t + note.duration + 0.35);
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
    }
    return this.audioCtx;
  }

  ngOnDestroy() {
    [...this.activeNotes.keys()].forEach(m => this.stopNote(m));
    this.audioCtx?.close();
  }
}
