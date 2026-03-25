import {
  Component, AfterViewInit, OnDestroy,
  ViewChild, ElementRef, NgZone
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Sampler, start as toneStart, now as toneNow } from 'tone';

const API = 'https://proyectopeque-o.onrender.com';

// ── Grid constants ───────────────────────────────────
const PITCH_MIN  = 21;   // A0  (full 88-key piano)
const PITCH_MAX  = 108;  // C8
const BEATS      = 32;
const BEAT_W     = 64;
const NOTE_H     = 18;
const KEY_W      = 52;
const SNAP       = 0.25;
const RESIZE_PX  = 10;

// ── Shared ────────────────────────────────────────────
const BLACK_SET  = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Keyboard → semitone (two-octave layout: lower = Z-M, upper = Q-U)
const KB_MAP: Record<string, number> = {
  'z':0, 's':1, 'x':2, 'd':3, 'c':4, 'v':5, 'g':6, 'b':7, 'h':8, 'n':9, 'j':10, 'm':11,
  'q':12,'2':13,'w':14,'3':15,'e':16,'r':17,'5':18,'t':19,'6':20,'y':21,'7':22,'u':23,
};

// Sampler (Salamander Grand Piano)
const SAMPLER_BASE = 'https://tonejs.github.io/audio/salamander/';
const SAMPLER_URLS: Record<string, string> = {
  A0:'A0.mp3',  C1:'C1.mp3',  'D#1':'Ds1.mp3','F#1':'Fs1.mp3',
  A1:'A1.mp3',  C2:'C2.mp3',  'D#2':'Ds2.mp3','F#2':'Fs2.mp3',
  A2:'A2.mp3',  C3:'C3.mp3',  'D#3':'Ds3.mp3','F#3':'Fs3.mp3',
  A3:'A3.mp3',  C4:'C4.mp3',  'D#4':'Ds4.mp3','F#4':'Fs4.mp3',
  A4:'A4.mp3',  C5:'C5.mp3',  'D#5':'Ds5.mp3','F#5':'Fs5.mp3',
  A5:'A5.mp3',  C6:'C6.mp3',  'D#6':'Ds6.mp3','F#6':'Fs6.mp3',
  A6:'A6.mp3',  C7:'C7.mp3',  'D#7':'Ds7.mp3','F#7':'Fs7.mp3',
  A7:'A7.mp3',  C8:'C8.mp3',
};

export interface PianoNote {
  id:       string;
  pitch:    number;
  start:    number;
  duration: number;
  velocity: number;
}

interface SavedRoll { _id: string; nombre: string; bpm: number; notes: PianoNote[]; }

@Component({
  selector: 'app-audio-piano-roll',
  standalone: false,
  templateUrl: './audio-piano-roll.html',
  styleUrl:    './audio-piano-roll.css',
})
export class AudioPianoRoll implements AfterViewInit, OnDestroy {

  @ViewChild('gridCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('container')  containerRef!: ElementRef<HTMLDivElement>;

  // ── Roll state
  notes:        PianoNote[] = [];
  savedRolls:   SavedRoll[] = [];
  saveName      = 'Mi composición';
  bpm           = 120;
  isPlaying     = false;
  playheadBeat  = 0;
  samplerReady  = false;
  samplerStatus = 'Cargando piano…';

  // ── Grid dims (template)
  readonly KEY_W  = KEY_W;
  readonly NOTE_H = NOTE_H;
  readonly BEAT_W = BEAT_W;
  readonly gridW  = KEY_W + BEATS * BEAT_W;
  readonly gridH  = (PITCH_MAX - PITCH_MIN + 1) * NOTE_H;

  // ── Piano vertical overlay
  pianoScrollLeft = 0;           // follows horizontal scroll
  kbOctave        = 4;           // base octave for keyboard shortcuts

  get activeKeysList(): number[] {
    return [...this.activeKeys].filter(p => p >= PITCH_MIN && p <= PITCH_MAX);
  }

  // ── Grid drag
  private dragMode: 'move' | 'resize' | null = null;
  private dragNote: PianoNote | null = null;
  private dragStartBeat    = 0;
  private dragStartPitch   = 0;
  private noteStartAtDown  = 0;
  private notePitchAtDown  = 0;

  // ── Audio
  private sampler:   Sampler | null = null;
  private playTimer: any = null;
  private phTimer:   any = null;
  private phStart    = 0;

  // ── Piano mouse/keyboard state
  private activeKeys   = new Set<number>();
  private mouseDown    = false;
  private lastKeyPitch: number | null = null;
  private kbDownFn!: (e: KeyboardEvent) => void;
  private kbUpFn!:   (e: KeyboardEvent) => void;
  private globalUpFn!: () => void;

  constructor(private http: HttpClient, private auth: AuthService, private zone: NgZone) {}

  ngAfterViewInit() {
    this.drawGrid();
    this.loadList();
    this.initSampler();
    this.setupListeners();
  }

  ngOnDestroy() {
    this.stop();
    this.sampler?.dispose();
    this.sampler = null;
    document.removeEventListener('keydown', this.kbDownFn);
    document.removeEventListener('keyup',   this.kbUpFn);
    document.removeEventListener('mouseup', this.globalUpFn);
  }

  // ── Grid scroll → keep piano overlay at left edge ────

  onGridScroll() {
    const el = this.containerRef?.nativeElement;
    if (el) this.pianoScrollLeft = el.scrollLeft;
  }

  // ── Sampler ───────────────────────────────────────────

  private initSampler() {
    this.sampler = new Sampler({
      urls:    SAMPLER_URLS,
      release: 1.5,
      baseUrl: SAMPLER_BASE,
      onload:  () => this.zone.run(() => { this.samplerReady = true; this.samplerStatus = '🎹 Piano listo'; }),
      onerror: () => this.zone.run(() => { this.samplerStatus = '⚠ Error al cargar'; }),
    }).toDestination();
  }

  private midiToName(pitch: number) {
    return NOTE_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 1);
  }

  private pressKey(pitch: number) {
    if (this.activeKeys.has(pitch)) return;
    const next = new Set(this.activeKeys); next.add(pitch);
    this.activeKeys = next;
    if (!this.sampler || !this.samplerReady) return;
    toneStart().then(() => {
      this.sampler!.triggerAttack(this.midiToName(pitch), toneNow(), 0.8);
    });
  }

  private releaseKey(pitch: number) {
    const next = new Set(this.activeKeys); next.delete(pitch);
    this.activeKeys = next;
    if (!this.sampler || !this.samplerReady) return;
    try { this.sampler.triggerRelease(this.midiToName(pitch), toneNow()); } catch {}
  }

  // ── Vertical piano overlay mouse events ──────────────

  private pitchFromEvent(e: MouseEvent): number {
    const el   = this.containerRef.nativeElement;
    const rect = el.getBoundingClientRect();
    const y    = e.clientY - rect.top + el.scrollTop;
    return Math.min(PITCH_MAX, Math.max(PITCH_MIN, PITCH_MAX - Math.floor(y / NOTE_H)));
  }

  onVPianoDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pitch = this.pitchFromEvent(e);
    this.mouseDown    = true;
    this.lastKeyPitch = pitch;
    this.pressKey(pitch);
  }

  onVPianoMove(e: MouseEvent) {
    if (!this.mouseDown) return;
    const pitch = this.pitchFromEvent(e);
    if (pitch === this.lastKeyPitch) return;
    if (this.lastKeyPitch !== null) this.releaseKey(this.lastKeyPitch);
    this.lastKeyPitch = pitch;
    this.pressKey(pitch);
  }

  onVPianoUp() {
    if (this.lastKeyPitch !== null) { this.releaseKey(this.lastKeyPitch); this.lastKeyPitch = null; }
    this.mouseDown = false;
  }

  // ── Keyboard setup ────────────────────────────────────

  shiftOctave(delta: number) {
    const next = this.kbOctave + delta;
    if (next >= 1 && next <= 7) this.kbOctave = next;
  }

  private setupListeners() {
    this.globalUpFn = () => {
      if (this.mouseDown) {
        this.mouseDown = false;
        if (this.lastKeyPitch !== null) {
          this.zone.run(() => { this.releaseKey(this.lastKeyPitch!); this.lastKeyPitch = null; });
        }
      }
    };

    this.kbDownFn = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); this.zone.run(() => this.shiftOctave(-1)); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.zone.run(() => this.shiftOctave(+1)); return; }
      const rel = KB_MAP[e.key.toLowerCase()];
      if (rel === undefined) return;
      const pitch = this.kbOctave * 12 + rel;
      if (pitch < PITCH_MIN || pitch > PITCH_MAX || this.activeKeys.has(pitch)) return;
      this.zone.run(() => this.pressKey(pitch));
    };

    this.kbUpFn = (e: KeyboardEvent) => {
      const rel = KB_MAP[e.key.toLowerCase()];
      if (rel === undefined) return;
      const pitch = this.kbOctave * 12 + rel;
      this.zone.run(() => this.releaseKey(pitch));
    };

    document.addEventListener('keydown', this.kbDownFn);
    document.addEventListener('keyup',   this.kbUpFn);
    document.addEventListener('mouseup', this.globalUpFn);
  }

  // ── Grid drawing ──────────────────────────────────────

  drawGrid() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    canvas.width  = this.gridW;
    canvas.height = this.gridH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < PITCH_MAX - PITCH_MIN + 1; i++) {
      const pitch = PITCH_MAX - i;
      const y     = i * NOTE_H;
      const sem   = pitch % 12;
      if (BLACK_SET.has(sem)) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(KEY_W, y, BEATS * BEAT_W, NOTE_H);
      }
      if (sem === 0) {
        ctx.fillStyle = 'rgba(56,189,248,0.07)';
        ctx.fillRect(KEY_W, y, BEATS * BEAT_W, NOTE_H);
      }
    }

    for (let i = 0; i <= PITCH_MAX - PITCH_MIN + 1; i++) {
      const y = i * NOTE_H;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(KEY_W, y); ctx.lineTo(this.gridW, y); ctx.stroke();
    }

    for (let b = 0; b <= BEATS; b++) {
      const x     = KEY_W + b * BEAT_W;
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth   = isBar ? 1.5 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.gridH); ctx.stroke();
      if (b < BEATS) {
        const xh = x + BEAT_W / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth   = 0.5;
        ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(xh, this.gridH); ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(56,189,248,0.5)';
    ctx.font = '10px monospace';
    for (let b = 0; b < BEATS; b += 4) {
      ctx.fillText(`${b / 4 + 1}`, KEY_W + b * BEAT_W + 4, 11);
    }

    // ── Piano keys (colored ivory / black) ──────────────
    const BK_W = Math.round(KEY_W * 0.64); // black key width (64% of column)

    for (let i = 0; i < PITCH_MAX - PITCH_MIN + 1; i++) {
      const pitch = PITCH_MAX - i;
      const y     = i * NOTE_H;
      const sem   = pitch % 12;
      const isBlk = BLACK_SET.has(sem);
      const oct   = Math.floor(pitch / 12) - 1;

      if (isBlk) {
        // Black key: dark gradient, narrower than full width
        const bkg = ctx.createLinearGradient(0, y, BK_W, y);
        bkg.addColorStop(0, '#0d1117');
        bkg.addColorStop(1, '#1a2035');
        ctx.fillStyle = bkg;
        ctx.fillRect(0, y + 0.5, BK_W, NOTE_H - 1);
        // subtle right edge separator
        ctx.fillStyle = 'rgba(56,189,248,0.08)';
        ctx.fillRect(BK_W, y + 0.5, KEY_W - BK_W - 1, NOTE_H - 1);
      } else {
        // White key: warm ivory gradient
        const wkg = ctx.createLinearGradient(0, y, KEY_W, y);
        wkg.addColorStop(0, '#e8e2d0');
        wkg.addColorStop(1, '#f5f0e2');
        ctx.fillStyle = wkg;
        ctx.fillRect(0, y + 0.5, KEY_W - 1, NOTE_H - 1);
        // thin bottom divider between white keys
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, y + NOTE_H - 1, KEY_W - 1, 0.5);
      }

      // C note label
      if (sem === 0) {
        ctx.fillStyle = '#1a5f8f';
        ctx.font = 'bold 8px monospace';
        ctx.fillText(`C${oct}`, 3, y + NOTE_H - 4);
      }
    }

    // Right border of piano column
    ctx.strokeStyle = 'rgba(56,189,248,0.35)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(KEY_W - 0.5, 0);
    ctx.lineTo(KEY_W - 0.5, this.gridH);
    ctx.stroke();
  }

  // ── Coordinate helpers ────────────────────────────────

  private snap(v: number) { return Math.round(v / SNAP) * SNAP; }

  private coords(e: MouseEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left + el.scrollLeft - KEY_W;
    const y = e.clientY - r.top  + el.scrollTop;
    const beat  = Math.max(0, Math.min(BEATS - SNAP, this.snap(x / BEAT_W)));
    const pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, PITCH_MAX - Math.floor(y / NOTE_H)));
    return { beat, pitch };
  }

  noteTop(pitch: number)      { return (PITCH_MAX - pitch) * NOTE_H; }
  noteLeft(start: number)     { return KEY_W + start * BEAT_W; }
  noteWidth(dur: number)      { return Math.max(8, dur * BEAT_W); }
  isBlack(pitch: number)      { return BLACK_SET.has(pitch % 12); }
  noteName(pitch: number)     { return NOTE_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 1); }
  playheadX()                 { return KEY_W + this.playheadBeat * BEAT_W; }
  trackById(_: number, n: PianoNote) { return n.id; }
  private uid()               { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── Mouse events (grid editor) ────────────────────────

  onGridDown(e: MouseEvent, el: HTMLElement) {
    if (e.button !== 0) return;
    const r = el.getBoundingClientRect();
    if (e.clientX - r.left + el.scrollLeft < KEY_W) return;

    const { beat, pitch } = this.coords(e, el);
    const note: PianoNote = { id: this.uid(), pitch, start: beat, duration: SNAP, velocity: 0.8 };
    this.notes = [...this.notes, note];
    this.dragMode = 'resize';
    this.dragNote = note;
    this.dragStartBeat = beat;
  }

  onNoteDown(e: MouseEvent, note: PianoNote, el: HTMLElement) {
    e.stopPropagation();
    if (e.button === 2) { this.notes = this.notes.filter(n => n.id !== note.id); return; }
    const target  = e.currentTarget as HTMLElement;
    const xInNote = e.clientX - target.getBoundingClientRect().left;

    if (xInNote >= this.noteWidth(note.duration) - RESIZE_PX) {
      this.dragMode = 'resize';
    } else {
      this.dragMode = 'move';
      const { beat, pitch } = this.coords(e, el);
      this.dragStartBeat   = beat;
      this.dragStartPitch  = pitch;
      this.noteStartAtDown = note.start;
      this.notePitchAtDown = note.pitch;
    }
    this.dragNote = note;
  }

  onMouseMove(e: MouseEvent, el: HTMLElement) {
    if (!this.dragMode || !this.dragNote) return;
    const { beat, pitch } = this.coords(e, el);
    const note = this.dragNote;

    if (this.dragMode === 'move') {
      note.start = Math.max(0, this.snap(this.noteStartAtDown + beat - this.dragStartBeat));
      note.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, this.notePitchAtDown + pitch - this.dragStartPitch));
    } else {
      note.duration = Math.max(SNAP, this.snap(beat - note.start));
    }
    this.notes = [...this.notes];
  }

  onMouseUp() { this.dragMode = null; this.dragNote = null; }

  // ── Playback ─────────────────────────────────────────

  async play() {
    if (this.isPlaying || !this.notes.length || !this.samplerReady || !this.sampler) return;
    await toneStart();
    this.stop();

    this.isPlaying = true;
    const spb  = 60 / this.bpm;
    const now  = toneNow() + 0.05;
    this.phStart = now;
    let maxEnd = 0;

    for (const note of this.notes) {
      const name    = this.midiToName(note.pitch);
      const startAt = now + note.start * spb;
      const dur     = note.duration * spb;
      const endAt   = startAt + dur;
      if (endAt > maxEnd) maxEnd = endAt;
      this.sampler.triggerAttackRelease(name, dur, startAt, note.velocity);
    }

    this.phTimer  = setInterval(() => {
      this.zone.run(() => { this.playheadBeat = (toneNow() - this.phStart) * (this.bpm / 60); });
    }, 40);
    this.playTimer = setTimeout(() => this.zone.run(() => this.stop()), (maxEnd - toneNow() + 0.6) * 1000);
  }

  stop() {
    this.isPlaying    = false;
    this.playheadBeat = 0;
    if (this.phTimer)   { clearInterval(this.phTimer);  this.phTimer   = null; }
    if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
    try { this.sampler?.releaseAll(); } catch {}
  }

  // ── Save / Load ──────────────────────────────────────

  save() {
    if (!this.notes.length) return;
    this.http.post(`${API}/api/piano-roll`, {
      userId: this.auth.getUserId(),
      nombre: this.saveName,
      bpm:    this.bpm,
      notes:  this.notes,
    }).subscribe({ next: () => this.loadList(), error: e => console.error(e) });
  }

  loadList() {
    this.http.get<SavedRoll[]>(`${API}/api/piano-roll`).subscribe({
      next: (data) => this.savedRolls = data,
      error: () => {}
    });
  }

  loadRoll(roll: SavedRoll) {
    this.stop();
    this.notes    = roll.notes.map(n => ({ ...n }));
    this.saveName = roll.nombre;
    this.bpm      = roll.bpm || 120;
  }

  deleteRoll(id: string) {
    this.http.delete(`${API}/api/piano-roll/${id}`).subscribe({
      next: () => { this.savedRolls = this.savedRolls.filter(r => r._id !== id); },
    });
  }

  clearAll() {
    if (!this.notes.length) return;
    if (!confirm('¿Borrar todas las notas?')) return;
    this.stop();
    this.notes = [];
  }
}
