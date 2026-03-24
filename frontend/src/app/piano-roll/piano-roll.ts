import {
  Component, Input, Output, EventEmitter, OnDestroy, AfterViewInit,
  HostListener, NgZone, ViewChild, ElementRef
} from '@angular/core';

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
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + octave;
}

// Base QWERTY → MIDI offset (C4 = 60 as anchor, octaveShift applied at runtime)
const BASE_KEY_MAP: Record<string, number> = {
  'z':48,'s':49,'x':50,'d':51,'c':52,'v':53,'g':54,'b':55,'h':56,'n':57,'j':58,'m':59,
  'q':60,'2':61,'w':62,'3':63,'e':64,'r':65,'5':66,'t':67,'6':68,'y':69,'7':70,'u':71,
  'i':72,
};

const NOTE_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316','#14b8a6'];

interface ActiveNote {
  oscs: OscillatorNode[];
  gains: GainNode[];
  lfo: OscillatorNode;
  lfoGain: GainNode;
  masterGain: GainNode;
  panner: StereoPannerNode;
  startCtxTime: number;
  noteObj: PianoNote;
}

interface ReverbBus {
  input: GainNode;
}

@Component({
  selector: 'app-piano-roll',
  standalone: false,
  templateUrl: './piano-roll.html',
  styleUrl: './piano-roll.css',
})
export class PianoRoll implements AfterViewInit, OnDestroy {
  @Input() playheadTime = 0;
  @Output() addTrack = new EventEmitter<{ url: string; nombre: string }>();
  @Output() seekTo = new EventEmitter<number>();
  @ViewChild('scrollEl') scrollEl!: ElementRef<HTMLDivElement>;

  readonly pxPerSecond = 80;
  readonly ROW_H = 20;
  readonly LABEL_W = 96;
  readonly MIDI_MIN = 21;  // A0 — full 88-key piano
  readonly MIDI_MAX = 108; // C8

  notes: PianoNote[] = [];
  isRecording = false;
  isExporting = false;
  cursorTime: number | null = null;

  // Octave shift: -3 … +3 (default 0 → keyboard plays C3–C5)
  octaveShift = 0;
  readonly OCT_MIN = -3;
  readonly OCT_MAX = 3;

  private noteId = 0;
  private audioCtx: AudioContext | null = null;
  private activeNotes = new Map<number, ActiveNote>();
  private recordingCtxStart = 0;
  private recordingTimelineStart = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private reverbBus: ReverbBus | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  constructor(private zone: NgZone) {}

  ngAfterViewInit() {
    // Scroll to middle C (C4 = MIDI 60) on load
    setTimeout(() => {
      const el = this.scrollEl?.nativeElement;
      if (!el) return;
      const c4Row = this.MIDI_MAX - 60; // rows from top
      const target = c4Row * this.ROW_H - el.clientHeight / 2 + this.ROW_H * 2;
      el.scrollTop = Math.max(0, target);
    }, 50);
  }

  // ---- MIDI range (top = high, bottom = low) ----
  get midiRange(): number[] {
    const range: number[] = [];
    for (let m = this.MIDI_MAX; m >= this.MIDI_MIN; m--) range.push(m);
    return range;
  }

  get timelineWidth(): number {
    const maxEnd = this.notes.reduce((mx, n) => Math.max(mx, n.startTime + n.duration), 10);
    return (maxEnd + 3) * this.pxPerSecond;
  }

  // Current keyboard octave range label
  get keyRangeLabel(): string {
    const lo = midiToName(48 + this.octaveShift * 12);
    const hi = midiToName(72 + this.octaveShift * 12);
    return `${lo} – ${hi}`;
  }

  shiftOctave(delta: number) {
    this.octaveShift = Math.max(this.OCT_MIN, Math.min(this.OCT_MAX, this.octaveShift + delta));
  }

  private keyToMidi(key: string): number | undefined {
    const base = BASE_KEY_MAP[key];
    if (base === undefined) return undefined;
    const midi = base + this.octaveShift * 12;
    return midi >= this.MIDI_MIN && midi <= this.MIDI_MAX ? midi : undefined;
  }

  isBlack(midi: number): boolean { return BLACK_OFFSETS.has(midi % 12); }
  isC(midi: number): boolean { return midi % 12 === 0; }
  showLabel(midi: number): boolean { return midi % 12 === 0 || midi === 21; } // C notes + A0
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

  onLaneMouseLeave() { this.cursorTime = null; }

  // ---- KEYBOARD ----
  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const midi = this.keyToMidi(e.key.toLowerCase());
    if (midi !== undefined && !this.activeNotes.has(midi)) this.playNote(midi);
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    const midi = this.keyToMidi(e.key.toLowerCase());
    if (midi !== undefined) this.stopNote(midi);
  }

  // ---- NOTE PLAY (rich multi-harmonic piano) ----
  playNote(midi: number) {
    if (this.activeNotes.has(midi)) return;
    const ctx = this.getCtx();
    const freq = midiToFreq(midi);
    const now = ctx.currentTime;

    // Pitch factor: 0 = A0 (lowest), 1 = C8 (highest)
    const pf = (midi - 21) / 87;

    // Pitch-dependent envelope
    const baseDecay  = 2.8 - pf * 2.2;   // 2.8s (low) → 0.6s (high)
    const sustainLvl = 0.28 - pf * 0.18;  // 0.28 → 0.10

    // Inharmonicity (piano strings stretch partials upward, more in low/high registers)
    const B = 0.0005 + (1 - Math.sin(Math.PI * pf)) * 0.003;

    // How many harmonics to render (more for low notes)
    const numH = Math.max(4, Math.round(9 - pf * 4));

    // Stereo position: low notes slightly left, high notes slightly right
    const panVal = ((midi - 64) / 50) * 0.4;

    // Master gain → compressor → destination
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(1.0, now + 0.006);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, panVal));

    masterGain.connect(panner);
    panner.connect(this.getCompressor(ctx));

    // Reverb send
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.22 + (1 - pf) * 0.1; // more reverb for low notes
    masterGain.connect(reverbSend);
    reverbSend.connect(this.getReverbBus(ctx).input);

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    // Harmonic amplitudes (decreasing, brighter for higher notes)
    const brightnessFactor = 0.5 + pf * 0.5;

    for (let n = 1; n <= numH; n++) {
      // Stretched partial frequency (inharmonic)
      const partialFreq = freq * n * Math.sqrt(1 + B * n * n);
      // Amplitude falls off: ~1/n with brightness adjustment
      const amp = (1 / n) * Math.pow(brightnessFactor, n - 1) * 0.5;
      const decay = baseDecay / Math.sqrt(n); // higher harmonics decay faster
      const sus = Math.max(sustainLvl / n, 0.001);

      const osc = ctx.createOscillator();
      osc.type = n === 1 ? 'triangle' : 'sine';
      osc.frequency.value = partialFreq;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.004);
      g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), now + decay);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(now);
      oscs.push(osc);
      gains.push(g);
    }

    // Hammer noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = Math.min(freq * 2.5, 9000);
    noiseFilter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    const noiseAmp = 0.22 - pf * 0.10; // softer hammer for high notes
    noiseGain.gain.setValueAtTime(noiseAmp, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start(now);
    noise.stop(now + 0.05);

    // LFO vibrato (kicks in after 180ms for held notes)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, now);
    lfoGain.gain.setValueAtTime(0, now + 0.18);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.004, now + 0.5);
    lfo.connect(lfoGain);
    oscs.forEach(o => lfoGain.connect(o.frequency));
    lfo.start(now);

    const startTime = this.isRecording
      ? this.recordingTimelineStart + (now - this.recordingCtxStart)
      : 0;

    const noteObj: PianoNote = { id: ++this.noteId, midi, noteName: midiToName(midi), startTime, duration: 0 };
    this.activeNotes.set(midi, { oscs, gains, lfo, lfoGain, masterGain, panner, startCtxTime: now, noteObj });

    if (this.isRecording) {
      this.zone.run(() => { this.notes = [...this.notes, noteObj]; });
    }
  }

  stopNote(midi: number) {
    const active = this.activeNotes.get(midi);
    if (!active) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    // Pitch-dependent release
    const pf = (midi - 21) / 87;
    const releaseTime = 0.6 - pf * 0.3; // 0.6s low → 0.3s high

    active.masterGain.gain.cancelScheduledValues(now);
    active.masterGain.gain.setValueAtTime(active.masterGain.gain.value, now);
    active.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);

    // Fade LFO
    active.lfoGain.gain.cancelScheduledValues(now);
    active.lfoGain.gain.linearRampToValueAtTime(0, now + 0.05);

    const stopAt = now + releaseTime + 0.05;
    active.oscs.forEach(o => o.stop(stopAt));
    active.lfo.stop(stopAt);

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
    [...this.activeNotes.keys()].forEach(m => this.stopNote(m));
    this.isRecording = false;
  }

  clearNotes() {
    [...this.activeNotes.keys()].forEach(m => this.stopNote(m));
    this.notes = [];
  }

  // ---- EXPORT ----
  async exportToTrack() {
    if (!this.notes.length) return;
    this.isExporting = true;
    try {
      const validNotes = this.notes.filter(n => n.duration > 0);
      const totalDur = Math.max(...validNotes.map(n => n.startTime + n.duration)) + 1.2;
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(2, Math.ceil(totalDur * sampleRate), sampleRate);

      // Shared compressor for offline
      const comp = offline.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      comp.connect(offline.destination);

      // Noise buffer
      const noiseLen = Math.ceil(0.06 * sampleRate);
      const noiseBuf = offline.createBuffer(1, noiseLen, sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

      for (const note of validNotes) {
        const freq = midiToFreq(note.midi);
        const t = note.startTime;
        const releaseT = t + note.duration;
        const pf = (note.midi - 21) / 87;
        const baseDecay = 2.8 - pf * 2.2;
        const sustainLvl = 0.28 - pf * 0.18;
        const B = 0.0005 + (1 - Math.sin(Math.PI * pf)) * 0.003;
        const numH = Math.max(4, Math.round(9 - pf * 4));
        const brightnessFactor = 0.5 + pf * 0.5;
        const pf_release = 0.6 - pf * 0.3;

        const masterGain = offline.createGain();
        masterGain.gain.setValueAtTime(0.001, t);
        masterGain.gain.linearRampToValueAtTime(1.0, t + 0.006);
        masterGain.gain.setValueAtTime(1.0, releaseT);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, releaseT + pf_release);

        const panner = offline.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, ((note.midi - 64) / 50) * 0.4));
        masterGain.connect(panner);
        panner.connect(comp);

        for (let n = 1; n <= numH; n++) {
          const partialFreq = freq * n * Math.sqrt(1 + B * n * n);
          const amp = (1 / n) * Math.pow(brightnessFactor, n - 1) * 0.5;
          const decay = baseDecay / Math.sqrt(n);
          const sus = Math.max(sustainLvl / n, 0.0001);

          const osc = offline.createOscillator();
          osc.type = n === 1 ? 'triangle' : 'sine';
          osc.frequency.value = partialFreq;
          const g = offline.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(amp, t + 0.004);
          g.gain.exponentialRampToValueAtTime(sus, t + decay);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(t);
          osc.stop(releaseT + pf_release + 0.1);
        }

        // Hammer
        const ns = offline.createBufferSource();
        ns.buffer = noiseBuf;
        const nf = offline.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = Math.min(freq * 2.5, 9000);
        nf.Q.value = 0.7;
        const ng = offline.createGain();
        ng.gain.setValueAtTime(0.22 - pf * 0.10, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        ns.connect(nf); nf.connect(ng); ng.connect(masterGain);
        ns.start(t); ns.stop(t + 0.06);
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
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const len = left.length;
    const ab = new ArrayBuffer(44 + len * 4);
    const v = new DataView(ab);
    const sr = buffer.sampleRate;
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0,'RIFF'); v.setUint32(4, 36 + len*4, true);
    ws(8,'WAVE'); ws(12,'fmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true); // stereo
    v.setUint32(24,sr,true); v.setUint32(28,sr*4,true); v.setUint16(32,4,true);
    v.setUint16(34,16,true); ws(36,'data'); v.setUint32(40,len*4,true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      const l = Math.max(-1, Math.min(1, left[i]));
      const r = Math.max(-1, Math.min(1, right[i]));
      v.setInt16(off,   l < 0 ? l * 0x8000 : l * 0x7FFF, true); off += 2;
      v.setInt16(off,   r < 0 ? r * 0x8000 : r * 0x7FFF, true); off += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  // ---- AUDIO CONTEXT & SHARED NODES ----
  private getCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext();
      this.noiseBuffer = null;
      this.reverbBus = null;
      this.compressor = null;
    }
    return this.audioCtx;
  }

  private getCompressor(ctx: AudioContext): AudioNode {
    if (!this.compressor) {
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 10;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.15;
      this.compressor.connect(ctx.destination);
    }
    return this.compressor;
  }

  private getReverbBus(ctx: AudioContext): ReverbBus {
    if (!this.reverbBus) {
      // Simple Schroeder-style reverb: 4 parallel delays + feedback
      const input = ctx.createGain();
      input.gain.value = 1;

      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      wet.connect(this.getCompressor(ctx));

      const delayTimes = [0.029, 0.037, 0.043, 0.051];
      for (const dt of delayTimes) {
        const delay = ctx.createDelay(0.1);
        delay.delayTime.value = dt;
        const fb = ctx.createGain();
        fb.gain.value = 0.30;
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.value = 3500;
        input.connect(delay);
        delay.connect(lpf);
        lpf.connect(fb);
        fb.connect(delay);
        lpf.connect(wet);
      }

      this.reverbBus = { input };
    }
    return this.reverbBus;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = Math.ceil(ctx.sampleRate * 0.06);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  ngOnDestroy() {
    [...this.activeNotes.keys()].forEach(m => this.stopNote(m));
    this.audioCtx?.close();
  }
}
