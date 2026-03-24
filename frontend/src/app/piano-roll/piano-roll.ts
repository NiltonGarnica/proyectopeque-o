import {
  Component, Input, Output, EventEmitter, OnDestroy, AfterViewInit,
  HostListener, NgZone, ViewChild, ElementRef
} from '@angular/core';
import * as Tone from 'tone';

export interface PianoNote {
  id: number;
  midi: number;
  noteName: string;
  startTime: number;
  duration: number;
}

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10]);

function midiToName(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

// Tone.js Salamander Grand Piano samples
const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';
const SALAMANDER_URLS: Record<string, string> = {
  'A0':'A0.mp3','C1':'C1.mp3','D#1':'Ds1.mp3','F#1':'Fs1.mp3',
  'A1':'A1.mp3','C2':'C2.mp3','D#2':'Ds2.mp3','F#2':'Fs2.mp3',
  'A2':'A2.mp3','C3':'C3.mp3','D#3':'Ds3.mp3','F#3':'Fs3.mp3',
  'A3':'A3.mp3','C4':'C4.mp3','D#4':'Ds4.mp3','F#4':'Fs4.mp3',
  'A4':'A4.mp3','C5':'C5.mp3','D#5':'Ds5.mp3','F#5':'Fs5.mp3',
  'A5':'A5.mp3','C6':'C6.mp3','D#6':'Ds6.mp3','F#6':'Fs6.mp3',
  'A6':'A6.mp3','C7':'C7.mp3','D#7':'Ds7.mp3','F#7':'Fs7.mp3',
  'A7':'A7.mp3','C8':'C8.mp3',
};

// Base QWERTY → MIDI (octaveShift applied at runtime)
const BASE_KEY_MAP: Record<string, number> = {
  'z':48,'s':49,'x':50,'d':51,'c':52,'v':53,'g':54,'b':55,'h':56,'n':57,'j':58,'m':59,
  'q':60,'2':61,'w':62,'3':63,'e':64,'r':65,'5':66,'t':67,'6':68,'y':69,'7':70,'u':71,
  'i':72,
};

const NOTE_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316','#14b8a6'];

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
  readonly MIDI_MIN = 21;
  readonly MIDI_MAX = 108;

  notes: PianoNote[] = [];
  isRecording = false;
  isExporting = false;
  samplerLoading = true;
  cursorTime: number | null = null;
  octaveShift = 0;
  readonly OCT_MIN = -3;
  readonly OCT_MAX = 3;

  private noteId = 0;
  private sampler: Tone.Sampler | null = null;
  private activeKeys = new Map<number, { noteName: string; startTone: number; noteObj: PianoNote }>();
  private recordingToneStart = 0;
  private recordingTimelineStart = 0;

  constructor(private zone: NgZone) {}

  ngAfterViewInit() {
    this.initSampler();
    setTimeout(() => {
      const el = this.scrollEl?.nativeElement;
      if (!el) return;
      const c4Row = this.MIDI_MAX - 60;
      el.scrollTop = Math.max(0, c4Row * this.ROW_H - el.clientHeight / 2);
    }, 60);
  }

  private async initSampler() {
    this.sampler = new Tone.Sampler({
      urls: SALAMANDER_URLS,
      release: 1.2,
      baseUrl: SALAMANDER_BASE,
    }).toDestination();
    await Tone.loaded();
    this.zone.run(() => { this.samplerLoading = false; });
  }

  // ---- RANGE ----
  get midiRange(): number[] {
    const r: number[] = [];
    for (let m = this.MIDI_MAX; m >= this.MIDI_MIN; m--) r.push(m);
    return r;
  }

  get timelineWidth(): number {
    const maxEnd = this.notes.reduce((mx, n) => Math.max(mx, n.startTime + n.duration), 10);
    return (maxEnd + 3) * this.pxPerSecond;
  }

  get keyRangeLabel(): string {
    return `${midiToName(48 + this.octaveShift * 12)} – ${midiToName(72 + this.octaveShift * 12)}`;
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
  showLabel(midi: number): boolean { return midi % 12 === 0 || midi === 21; }
  noteName(midi: number): string { return midiToName(midi); }
  noteColor(midi: number): string { return NOTE_COLORS[Math.floor(midi / 12) % NOTE_COLORS.length]; }
  isActive(midi: number): boolean { return this.activeKeys.has(midi); }

  notesForMidi(midi: number): PianoNote[] {
    return this.notes.filter(n => n.midi === midi && n.duration > 0);
  }
  noteWidth(note: PianoNote): number { return Math.max(6, note.duration * this.pxPerSecond); }

  // ---- MOUSE NAVIGATION ----
  onLaneClick(event: MouseEvent, el: HTMLElement) {
    const x = event.clientX - el.getBoundingClientRect().left + el.scrollLeft - this.LABEL_W;
    if (x < 0) return;
    const t = x / this.pxPerSecond;
    this.playheadTime = t;
    this.seekTo.emit(t);
  }

  onLaneMouseMove(event: MouseEvent, el: HTMLElement) {
    const x = event.clientX - el.getBoundingClientRect().left + el.scrollLeft - this.LABEL_W;
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
    if (midi !== undefined && !this.activeKeys.has(midi)) this.playNote(midi);
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    const midi = this.keyToMidi(e.key.toLowerCase());
    if (midi !== undefined) this.stopNote(midi);
  }

  // ---- NOTE PLAY / STOP ----
  playNote(midi: number) {
    if (!this.sampler || this.activeKeys.has(midi)) return;
    const noteName = midiToName(midi);
    const now = Tone.now();
    this.sampler.triggerAttack(noteName, now);

    const startTime = this.isRecording
      ? this.recordingTimelineStart + (now - this.recordingToneStart)
      : 0;

    const noteObj: PianoNote = { id: ++this.noteId, midi, noteName, startTime, duration: 0 };
    this.activeKeys.set(midi, { noteName, startTone: now, noteObj });

    if (this.isRecording) {
      this.zone.run(() => { this.notes = [...this.notes, noteObj]; });
    }
  }

  stopNote(midi: number) {
    const active = this.activeKeys.get(midi);
    if (!active || !this.sampler) return;
    this.sampler.triggerRelease(active.noteName, Tone.now());

    if (this.isRecording) {
      const dur = Tone.now() - active.startTone;
      active.noteObj.duration = Math.max(0.05, dur);
      this.zone.run(() => { this.notes = [...this.notes]; });
    }

    this.activeKeys.delete(midi);
  }

  // ---- RECORDING ----
  startRecording() {
    this.recordingToneStart = Tone.now();
    this.recordingTimelineStart = this.playheadTime;
    this.notes = [];
    this.isRecording = true;
  }

  stopRecording() {
    [...this.activeKeys.keys()].forEach(m => this.stopNote(m));
    this.isRecording = false;
  }

  clearNotes() {
    [...this.activeKeys.keys()].forEach(m => this.stopNote(m));
    this.notes = [];
  }

  // ---- EXPORT (offline render with Tone.js) ----
  async exportToTrack() {
    if (!this.notes.length) return;
    this.isExporting = true;
    try {
      const validNotes = this.notes.filter(n => n.duration > 0);
      const totalDur = Math.max(...validNotes.map(n => n.startTime + n.duration)) + 2.0;

      const buffer = await Tone.Offline(async () => {
        const offSampler = new Tone.Sampler({
          urls: SALAMANDER_URLS,
          release: 1.2,
          baseUrl: SALAMANDER_BASE,
        }).toDestination();
        await Tone.loaded();
        for (const note of validNotes) {
          offSampler.triggerAttack(note.noteName, note.startTime);
          offSampler.triggerRelease(note.noteName, note.startTime + note.duration);
        }
      }, totalDur, 2);

      const wav = this.toneBufferToWav(buffer);
      const url = URL.createObjectURL(wav);
      this.zone.run(() => {
        this.isExporting = false;
        this.addTrack.emit({ url, nombre: 'Piano Roll' });
      });
    } catch (err) {
      console.error('Export error', err);
      this.zone.run(() => { this.isExporting = false; });
    }
  }

  private toneBufferToWav(toneBuffer: Tone.ToneAudioBuffer): Blob {
    const ab = toneBuffer.get()!;
    const left  = ab.getChannelData(0);
    const right = ab.numberOfChannels > 1 ? ab.getChannelData(1) : left;
    const len = left.length;
    const arrBuf = new ArrayBuffer(44 + len * 4);
    const v = new DataView(arrBuf);
    const sr = ab.sampleRate;
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0,'RIFF'); v.setUint32(4, 36 + len * 4, true);
    ws(8,'WAVE'); ws(12,'fmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*4,true); v.setUint16(32,4,true);
    v.setUint16(34,16,true); ws(36,'data'); v.setUint32(40,len*4,true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      const l = Math.max(-1, Math.min(1, left[i]));
      const r = Math.max(-1, Math.min(1, right[i]));
      v.setInt16(off, l < 0 ? l * 0x8000 : l * 0x7FFF, true); off += 2;
      v.setInt16(off, r < 0 ? r * 0x8000 : r * 0x7FFF, true); off += 2;
    }
    return new Blob([arrBuf], { type: 'audio/wav' });
  }

  ngOnDestroy() {
    [...this.activeKeys.keys()].forEach(m => this.stopNote(m));
    this.sampler?.dispose();
  }
}
