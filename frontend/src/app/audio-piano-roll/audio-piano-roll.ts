import {
  Component, AfterViewInit, OnDestroy,
  ViewChild, ElementRef, NgZone
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Sampler, start as toneStart, now as toneNow } from 'tone';

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

// Salamander Grand Piano samples (Tone.js CDN)
const SAMPLER_BASE = 'https://tonejs.github.io/audio/salamander/';
const SAMPLER_URLS: Record<string, string> = {
  A0:'A0.mp3',  C1:'C1.mp3',  'D#1':'Ds1.mp3', 'F#1':'Fs1.mp3',
  A1:'A1.mp3',  C2:'C2.mp3',  'D#2':'Ds2.mp3', 'F#2':'Fs2.mp3',
  A2:'A2.mp3',  C3:'C3.mp3',  'D#3':'Ds3.mp3', 'F#3':'Fs3.mp3',
  A3:'A3.mp3',  C4:'C4.mp3',  'D#4':'Ds4.mp3', 'F#4':'Fs4.mp3',
  A4:'A4.mp3',  C5:'C5.mp3',  'D#5':'Ds5.mp3', 'F#5':'Fs5.mp3',
  A5:'A5.mp3',  C6:'C6.mp3',  'D#6':'Ds6.mp3', 'F#6':'Fs6.mp3',
  A6:'A6.mp3',  C7:'C7.mp3',  'D#7':'Ds7.mp3', 'F#7':'Fs7.mp3',
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

  // State
  notes:        PianoNote[] = [];
  savedRolls:   SavedRoll[] = [];
  saveName      = 'Mi composición';
  bpm           = 120;
  isPlaying     = false;
  playheadBeat  = 0;
  samplerReady  = false;
  samplerStatus = 'Cargando piano…';

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
  private sampler: Sampler | null = null;
  private playTimer: any = null;
  private phTimer:   any = null;
  private phStart   = 0;

  constructor(private http: HttpClient, private auth: AuthService, private zone: NgZone) {
    for (let p = PITCH_MAX; p >= PITCH_MIN; p--) this.pitchRows.push(p);
  }

  ngAfterViewInit() {
    this.drawGrid();
    this.loadList();
    this.initSampler();
  }

  ngOnDestroy() {
    this.stop();
    this.sampler?.dispose();
    this.sampler = null;
  }

  // ── Sampler init ─────────────────────────────────────

  private initSampler() {
    this.sampler = new Sampler({
      urls: SAMPLER_URLS,
      release: 1.5,
      baseUrl: SAMPLER_BASE,
      onload: () => {
        this.zone.run(() => {
          this.samplerReady  = true;
          this.samplerStatus = '🎹 Piano listo';
        });
      },
      onerror: () => {
        this.zone.run(() => {
          this.samplerStatus = '⚠ Error al cargar piano';
        });
      },
    }).toDestination();
  }

  // ── Grid drawing ─────────────────────────────────────

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
      if (sem === 0) {
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

    // Vertical grid lines
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

  noteTop(pitch: number)       { return (PITCH_MAX - pitch) * NOTE_H; }
  noteLeft(start: number)      { return KEY_W + start * BEAT_W; }
  noteWidth(duration: number)  { return Math.max(8, duration * BEAT_W); }
  isBlack(pitch: number)       { return BLACK_SET.has(pitch % 12); }
  noteName(pitch: number)      { return NOTE_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 1); }
  playheadX()                  { return KEY_W + this.playheadBeat * BEAT_W; }
  trackById(_: number, n: PianoNote) { return n.id; }
  private uid()                { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── Mouse events ─────────────────────────────────────

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

  // ── Playback (Tone.js Sampler) ────────────────────────

  async play() {
    if (this.isPlaying || !this.notes.length || !this.samplerReady || !this.sampler) return;

    await toneStart();
    this.stop();

    this.isPlaying = true;
    const secPerBeat = 60 / this.bpm;
    const now = toneNow() + 0.05;
    this.phStart = now;

    let maxEnd = 0;
    for (const note of this.notes) {
      const name     = this.noteName(note.pitch);
      const startAt  = now + note.start * secPerBeat;
      const dur      = note.duration * secPerBeat;
      const endAt    = startAt + dur;
      if (endAt > maxEnd) maxEnd = endAt;
      this.sampler.triggerAttackRelease(name, dur, startAt, note.velocity);
    }

    this.phTimer = setInterval(() => {
      this.zone.run(() => {
        this.playheadBeat = (toneNow() - this.phStart) * (this.bpm / 60);
      });
    }, 40);

    this.playTimer = setTimeout(() => {
      this.zone.run(() => this.stop());
    }, (maxEnd - toneNow() + 0.6) * 1000);
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

  // ── Piano key preview (Tone.js) ──────────────────────

  previewPitch(pitch: number) {
    if (!this.sampler || !this.samplerReady) return;
    toneStart().then(() => {
      this.sampler!.triggerAttackRelease(this.noteName(pitch), '8n');
    });
  }
}
