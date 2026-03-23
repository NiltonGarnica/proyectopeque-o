import { Component, Input, Output, EventEmitter, NgZone } from '@angular/core';

export interface EfectosPista {
  volumen: number;
  eco: number;
  reverb: number;
  graves: number;
  agudos: number;
}

export interface Pista {
  url: string;
  nombre: string;
  activa: boolean;
  esMezcla?: boolean;
  mostrarEfectos?: boolean;
  efectos: EfectosPista;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  duration: number;
  color: string;
}

@Component({
  selector: 'app-audio-timeline',
  standalone: false,
  templateUrl: './audio-timeline.html',
  styleUrl: './audio-timeline.css',
})
export class AudioTimeline {
  @Input() pistas: Pista[] = [];
  @Input() playheadTime = 0;
  @Input() reproduciendo = false;
  @Output() splitAt = new EventEmitter<{ index: number; tiempo: number }>();
  @Output() deletePista = new EventEmitter<number>();
  @Output() seekTo = new EventEmitter<number>();

  pxPerSecond = 80;
  readonly LABEL_W = 80;

  private dragState: {
    type: 'move' | 'trim-left' | 'trim-right';
    pistaIndex: number;
    startX: number;
    origStartTime: number;
    origTrimStart: number;
    origTrimEnd: number;
  } | null = null;

  private boundMove = (e: PointerEvent) => this.zone.run(() => this.onPointerMove(e));
  private boundUp = () => this.zone.run(() => this.onPointerUp());

  constructor(private zone: NgZone) {}

  get totalDuration(): number {
    if (!this.pistas.length) return 10;
    return Math.max(
      ...this.pistas.map(p => p.startTime + Math.max(0.1, p.duration - p.trimStart - p.trimEnd)),
      10
    );
  }

  get timelineWidth(): number {
    return (this.totalDuration + 3) * this.pxPerSecond;
  }

  get rulerTicks(): number[] {
    const step = this.pxPerSecond >= 120 ? 1 : this.pxPerSecond >= 60 ? 2 : 5;
    const ticks: number[] = [];
    for (let t = 0; t <= this.totalDuration + 3; t += step) ticks.push(t);
    return ticks;
  }

  trackWidth(p: Pista): number {
    return Math.max(12, (p.duration - p.trimStart - p.trimEnd) * this.pxPerSecond);
  }

  zoomIn() { this.pxPerSecond = Math.min(this.pxPerSecond * 1.5, 400); }
  zoomOut() { this.pxPerSecond = Math.max(this.pxPerSecond / 1.5, 20); }

  onRulerClick(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const t = Math.max(0, (event.clientX - rect.left) / this.pxPerSecond);
    this.seekTo.emit(t);
  }

  splitAtPlayhead() {
    for (let i = 0; i < this.pistas.length; i++) {
      const p = this.pistas[i];
      const trackEnd = p.startTime + p.duration - p.trimStart - p.trimEnd;
      if (this.playheadTime > p.startTime + 0.05 && this.playheadTime < trackEnd - 0.05) {
        this.splitAt.emit({ index: i, tiempo: this.playheadTime });
        return;
      }
    }
  }

  startMove(event: PointerEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const p = this.pistas[index];
    this.dragState = {
      type: 'move', pistaIndex: index, startX: event.clientX,
      origStartTime: p.startTime, origTrimStart: p.trimStart, origTrimEnd: p.trimEnd,
    };
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
  }

  startTrim(event: PointerEvent, index: number, side: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const p = this.pistas[index];
    this.dragState = {
      type: side === 'left' ? 'trim-left' : 'trim-right',
      pistaIndex: index, startX: event.clientX,
      origStartTime: p.startTime, origTrimStart: p.trimStart, origTrimEnd: p.trimEnd,
    };
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.dragState) return;
    const ds = (event.clientX - this.dragState.startX) / this.pxPerSecond;
    const p = this.pistas[this.dragState.pistaIndex];
    const d = this.dragState;

    if (d.type === 'move') {
      p.startTime = Math.max(0, d.origStartTime + ds);

    } else if (d.type === 'trim-left') {
      const maxTrim = p.duration - d.origTrimEnd - 0.05;
      const newTrim = Math.max(0, Math.min(d.origTrimStart + ds, maxTrim));
      p.startTime = Math.max(0, d.origStartTime + (newTrim - d.origTrimStart));
      p.trimStart = newTrim;

    } else if (d.type === 'trim-right') {
      const maxTrim = p.duration - d.origTrimStart - 0.05;
      p.trimEnd = Math.max(0, Math.min(d.origTrimEnd - ds, maxTrim));
    }
  }

  private onPointerUp() {
    this.dragState = null;
    window.removeEventListener('pointermove', this.boundMove);
    window.removeEventListener('pointerup', this.boundUp);
  }
}
