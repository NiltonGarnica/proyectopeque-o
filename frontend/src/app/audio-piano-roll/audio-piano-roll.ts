import {
  Component, AfterViewInit, OnDestroy,
  ViewChild, ElementRef, NgZone
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

// ── Grid constants ───────────────────────────────────
const PITCH_MIN  = 36;   // C2
const PITCH_MAX  = 83;   // B5
const BEATS      = 32;   // columns
const BEAT_W     = 64;   // px per beat
const NOTE_H     = 18;   // px per semitone row
const KEY_W      = 52;   // piano key column width
const SNAP       = 0.25; // beat snap resolution
const RESIZE_PX  = 10;   // px on right edge → resize handle

const BLACK_SET  = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

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

  // State
  notes:      PianoNote[] = [];
  savedRolls: SavedRoll[] = [];
  saveName    = 'Mi composición';
  bpm         = 120;
  isPlaying   = false;
  playheadBeat = 0;

  // Grid dimensions (used in template)
  readonly KEY_W  = KEY_W;
  readonly NOTE_H = NOTE_H;
  readonly BEAT_W = BEAT_W;
  readonly gridW  = KEY_W + BEATS * BEAT_W;
  readonly gridH  = (PITCH_MAX - PITCH_MIN + 1) * NOTE_H;
  readonly pitchRows: number[] = [];

  // Drag
  private dragMode: 'move' | 'resize' | null = null;
  private dragNote: PianoNote | null = null;
  private dragStartBeat  = 0;
  private dragStartPitch = 0;
  private noteStartAtDown  = 0;
  private notePitchAtDown  = 0;

  // Audio
  private audioCtx: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private playTimer: any = null;
  private phTimer:   any = null;
  private ctxStart  = 0;

  constructor(private http: HttpClient, private auth: AuthService, private zone: NgZone) {
    for (let p = PITCH_MAX; p >= PITCH_MIN; p--) this.pitchRows.push(p);
  }

  ngAfterViewInit() { this.drawGrid(); this.loadList(); }
  ngOnDestroy()     { this.stop(); }

  // ── Grid drawing ────────────────────────────────────

  drawGrid() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    canvas.width  = this.gridW;
    canvas.height = this.gridH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Row backgrounds
    for (let i = 0; i < PITCH_MAX - PITCH_MIN + 1; i++) {
      const pitch = PITCH_MAX - i;
      const y     = i * NOTE_H;
      const sem   = pitch % 12;
      if (BLACK_SET.has(sem)) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(KEY_W, y, BEATS * BEAT_W, NOTE_H);
      }
      if (sem === 0) { // C rows — subtle highlight
        ctx.fillStyle = 'rgba(56,189,248,0.07)';
        ctx.fillRect(KEY_W, y, BEATS * BEAT_W, NOTE_H);
      }
    }

    // Horizontal grid lines
    for (let i = 0; i <= PITCH_MAX - PITCH_MIN + 1; i++) {
      const y = i * NOTE_H;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(KEY_W, y); ctx.lineTo(this.gridW, y); ctx.stroke();
    }

    // Vertical grid lines (beat / bar / sub-beat)
    for (let b = 0; b <= BEATS; b++) {
      const x     = KEY_W + b * BEAT_W;
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth   = isBar ? 1.5 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.gridH); ctx.stroke();
      // half-beat
      if (b < BEATS) {
        const xh = x + BEAT_W / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth   = 0.5;
        ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(xh, this.gridH); ctx.stroke();
      }
    }

    // Bar numbers
    ctx.fillStyle = 'rgba(56,189,248,0.5)';
    ctx.font = '10px monospace';
    for (let b = 0; b < BEATS; b += 4) {
      ctx.fillText(`${b / 4 + 1}`, KEY_W + b * BEAT_W + 4, 11);
    }

    // Piano keys
    for (let i = 0; i < PITCH_MAX - PITCH_MIN + 1; i++) {
      const pitch = PITCH_MAX - i;
      const y     = i * NOTE_H;
      const sem   = pitch % 12;
      const isBlk = BLACK_SET.has(sem);
      const oct   = Math.floor(pitch / 12) - 1;

      ctx.fillStyle = isBlk ? '#0f1f30' : 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, y + 0.5, KEY_W - 1, NOTE_H - 1);

      if (sem === 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`C${oct}`, 4, y + NOTE_H - 4);
      }
    }
  }

  // ── Coordinate helpers ───────────────────────────────

  private snap(v: number) { return Math.round(v / SNAP) * SNAP; }

  private coords(e: MouseEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left + el.scrollLeft - KEY_W;
    const y = e.clientY - r.top  + el.scrollTop;
    const beat  = Math.max(0, Math.min(BEATS - SNAP, this.snap(x / BEAT_W)));
    const pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, PITCH_MAX - Math.floor(y / NOTE_H)));
    return { beat, pitch };
  }

  noteTop(pitch: number)       { return (PITCH_MAX - pitch) * NOTE_H; }
  noteLeft(start: number)      { return KEY_W + start * BEAT_W; }
  noteWidth(duration: number)  { return Math.max(8, duration * BEAT_W); }
  isBlack(pitch: number)       { return BLACK_SET.has(pitch % 12); }
  noteName(pitch: number)      { return NOTE_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 1); }
  playheadX()                  { return KEY_W + this.playheadBeat * BEAT_W; }
  trackById(_: number, n: PianoNote) { return n.id; }
  private uid()                { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── Mouse events ────────────────────────────────────

  onGridDown(e: MouseEvent, el: HTMLElement) {
    if (e.button !== 0) return;
    // Ignore clicks on piano key column
    const r = el.getBoundingClientRect();
    const xInEl = e.clientX - r.left + el.scrollLeft;
    if (xInEl < KEY_W) return;

    const { beat, pitch } = this.coords(e, el);
    const note: PianoNote = { id: this.uid(), pitch, start: beat, duration: SNAP, velocity: 0.8 };
    this.notes = [...this.notes, note];

    this.dragMode = 'resize';
    this.dragNote = note;
    this.dragStartBeat = beat;
  }

  onNoteDown(e: MouseEvent, note: PianoNote, el: HTMLElement) {
    e.stopPropagation();
    if (e.button === 2) {
      this.notes = this.notes.filter(n => n.id !== note.id);
      return;
    }
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

  play() {
    if (this.isPlaying || !this.notes.length) return;
    this.stop();
    const ctx   = new AudioContext();
    this.audioCtx = ctx;
    const bps   = this.bpm / 60;
    const now   = ctx.currentTime + 0.05;
    this.ctxStart = now;
    this.isPlaying = true;

    const master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);

    let maxEnd = 0;
    for (const note of this.notes) {
      const freq  = 440 * Math.pow(2, (note.pitch - 69) / 12);
      const at    = now + note.start / bps;
      const dur   = note.duration / bps;
      const endAt = at + dur;
      if (endAt > maxEnd) maxEnd = endAt;

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(note.velocity * 0.55, at + 0.01);
      env.gain.setValueAtTime(note.velocity * 0.55, Math.max(at + 0.01, endAt - 0.04));
      env.gain.linearRampToValueAtTime(0.0001, endAt);

      osc.connect(env); env.connect(master);
      osc.start(at); osc.stop(endAt + 0.05);
      this.oscillators.push(osc);
    }

    // Playhead ticker
    this.phTimer = setInterval(() => {
      this.zone.run(() => {
        if (!this.audioCtx) return;
        this.playheadBeat = (this.audioCtx.currentTime - this.ctxStart) * bps;
      });
    }, 40);

    // Auto-stop
    this.playTimer = setTimeout(() => this.zone.run(() => this.stop()), (maxEnd - now + 0.4) * 1000);
  }

  stop() {
    this.isPlaying   = false;
    this.playheadBeat = 0;
    if (this.phTimer)   { clearInterval(this.phTimer);  this.phTimer   = null; }
    if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
    for (const o of this.oscillators) { try { o.stop(); } catch {} }
    this.oscillators = [];
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
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

  // ── Piano key preview ────────────────────────────────

  previewPitch(pitch: number) {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
    env.gain.setValueAtTime(0.4, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(env); env.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close(), 600);
  }
}
