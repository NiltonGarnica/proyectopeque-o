import { Component, Input, Output, EventEmitter, NgZone, DoCheck, HostListener, OnDestroy } from '@angular/core';

export interface Segmento {
  id: number;
  url: string;
  nombre: string;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  duration: number;
}

export interface EfectosPista {
  volumen: number;
  eco: number;
  reverb: number;
  graves: number;
  agudos: number;
}

export interface Pista {
  nombre: string;
  activa: boolean;
  mostrarEfectos?: boolean;
  efectos: EfectosPista;
  color: string;
  segmentos: Segmento[];
}

@Component({
  selector: 'app-audio-timeline',
  standalone: false,
  templateUrl: './audio-timeline.html',
  styleUrl: './audio-timeline.css',
})
export class AudioTimeline implements DoCheck, OnDestroy {
  @Input() pistas: Pista[] = [];
  @Input() playheadTime = 0;
  @Input() reproduciendo = false;
  @Output() seekTo = new EventEmitter<number>();
  @Output() deletePista = new EventEmitter<number>();

  pxPerSecond = 80;
  readonly LABEL_W = 80;
  readonly ROW_H = 52;

  selectedSeg: { pi: number; si: number } | null = null;

  // Context menu
  contextMenu: { x: number; y: number; pi: number; si: number } | null = null;

  // Waveform cache: url → SVG path string
  readonly waveformPaths = new Map<string, string>();
  private readonly seenUrls = new Set<string>();
  private waveformCtx: AudioContext | null = null;

  private segCounter = 0;
  private nextId() { return ++this.segCounter; }

  private dragState: {
    type: 'move' | 'trim-left' | 'trim-right';
    srcPi: number; si: number; targetPi: number;
    startX: number; startY: number;
    origStartTime: number; origTrimStart: number; origTrimEnd: number;
    hasMoved: boolean;
  } | null = null;

  private boundMove = (e: PointerEvent) => this.zone.run(() => this.onPointerMove(e));
  private boundUp = () => this.zone.run(() => this.onPointerUp());

  constructor(private zone: NgZone) {}

  ngDoCheck() {
    for (const p of this.pistas) {
      for (const s of p.segmentos) {
        if (!this.seenUrls.has(s.url)) {
          this.seenUrls.add(s.url);
          this.fetchWaveform(s.url);
        }
      }
    }
  }

  ngOnDestroy() {
    this.waveformCtx?.close();
  }

  private async fetchWaveform(url: string) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return;
      const ab = await res.arrayBuffer();
      if (!this.waveformCtx || this.waveformCtx.state === 'closed') {
        this.waveformCtx = new AudioContext();
      }
      const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
        this.waveformCtx!.decodeAudioData(ab.slice(0), resolve, reject);
      });
      // Downsample to 100 peaks
      const data = buffer.getChannelData(0);
      const N = 100;
      const step = Math.max(1, Math.floor(data.length / N));
      const peaks: number[] = [];
      for (let i = 0; i < N; i++) {
        let max = 0;
        for (let j = 0; j < step; j++) max = Math.max(max, Math.abs(data[i * step + j] || 0));
        peaks.push(max);
      }
      // SVG path: filled waveform centered at mid
      const H = 28, mid = H / 2;
      let d = `M0,${mid}`;
      for (let i = 0; i < N; i++) d += ` L${i},${mid - peaks[i] * mid * 0.88}`;
      d += ` L${N},${mid}`;
      for (let i = N - 1; i >= 0; i--) d += ` L${i},${mid + peaks[i] * mid * 0.88}`;
      d += ' Z';

      this.zone.run(() => this.waveformPaths.set(url, d));
    } catch { /* silent - waveform optional */ }
  }

  getWaveformPath(url: string): string | null {
    return this.waveformPaths.get(url) || null;
  }

  // ---- CONTEXT MENU ----

  onContextMenu(e: MouseEvent, pi: number, si: number) {
    e.preventDefault();
    e.stopPropagation();
    this.contextMenu = { x: e.clientX, y: e.clientY, pi, si };
    this.selectedSeg = { pi, si };
  }

  @HostListener('document:click')
  closeContextMenu() { this.contextMenu = null; }

  ctxCopy() {
    if (!this.contextMenu) return;
    const { pi, si } = this.contextMenu;
    this.selectedSeg = { pi, si };
    this.copySelected();
    this.contextMenu = null;
  }

  ctxDuplicate() {
    if (!this.contextMenu) return;
    const { pi, si } = this.contextMenu;
    const s = this.pistas[pi].segmentos[si];
    const src = this.pistas[pi];
    this.pistas.push({
      nombre: `Pista ${this.pistas.length + 1}`,
      activa: src.activa,
      color: src.color,
      efectos: { ...src.efectos },
      segmentos: [{ ...s, id: this.nextId() }],
    });
    this.contextMenu = null;
  }

  ctxDelete() {
    if (!this.contextMenu) return;
    const { pi, si } = this.contextMenu;
    this.pistas[pi].segmentos.splice(si, 1);
    if (this.pistas[pi].segmentos.length === 0) this.pistas.splice(pi, 1);
    this.selectedSeg = null;
    this.contextMenu = null;
  }

  // ---- TIMELINE ----

  get totalDuration(): number {
    let max = 10;
    for (const p of this.pistas)
      for (const s of p.segmentos)
        max = Math.max(max, s.startTime + s.duration - s.trimStart - s.trimEnd);
    return max;
  }

  get timelineWidth(): number { return (this.totalDuration + 3) * this.pxPerSecond; }

  get rulerTicks(): number[] {
    const step = this.pxPerSecond >= 120 ? 1 : this.pxPerSecond >= 60 ? 2 : 5;
    const ticks: number[] = [];
    for (let t = 0; t <= this.totalDuration + 3; t += step) ticks.push(t);
    return ticks;
  }

  segWidth(s: Segmento): number {
    return Math.max(12, (s.duration - s.trimStart - s.trimEnd) * this.pxPerSecond);
  }

  zoomIn() { this.pxPerSecond = Math.min(this.pxPerSecond * 1.5, 400); }
  zoomOut() { this.pxPerSecond = Math.max(this.pxPerSecond / 1.5, 20); }

  onRulerClick(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.seekTo.emit(Math.max(0, (e.clientX - rect.left) / this.pxPerSecond));
  }

  clearSelection() { this.selectedSeg = null; }

  copySelected() {
    if (!this.selectedSeg) return;
    const { pi, si } = this.selectedSeg;
    const s = this.pistas[pi].segmentos[si];
    const w = s.duration - s.trimStart - s.trimEnd;
    const copy: Segmento = { ...s, id: this.nextId(), startTime: s.startTime + w + 0.05 };
    this.pistas[pi].segmentos.push(copy);
    this.selectedSeg = { pi, si: this.pistas[pi].segmentos.length - 1 };
  }

  splitAtPlayhead() {
    const t = this.playheadTime;
    for (let pi = 0; pi < this.pistas.length; pi++) {
      const segs = this.pistas[pi].segmentos;
      for (let si = 0; si < segs.length; si++) {
        const s = segs[si];
        const end = s.startTime + s.duration - s.trimStart - s.trimEnd;
        if (t > s.startTime + 0.05 && t < end - 0.05) {
          const splitAudio = s.trimStart + (t - s.startTime);
          segs.splice(si, 1,
            { ...s, id: this.nextId(), trimEnd: s.duration - splitAudio },
            { ...s, id: this.nextId(), startTime: t, trimStart: splitAudio }
          );
          this.selectedSeg = null;
          return;
        }
      }
    }
  }

  // ---- DRAG ----

  startMove(event: PointerEvent, pi: number, si: number) {
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const s = this.pistas[pi].segmentos[si];
    this.dragState = {
      type: 'move', srcPi: pi, si, targetPi: pi,
      startX: event.clientX, startY: event.clientY,
      origStartTime: s.startTime, origTrimStart: s.trimStart, origTrimEnd: s.trimEnd,
      hasMoved: false,
    };
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
  }

  startTrim(event: PointerEvent, pi: number, si: number, side: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const s = this.pistas[pi].segmentos[si];
    this.dragState = {
      type: side === 'left' ? 'trim-left' : 'trim-right',
      srcPi: pi, si, targetPi: pi,
      startX: event.clientX, startY: event.clientY,
      origStartTime: s.startTime, origTrimStart: s.trimStart, origTrimEnd: s.trimEnd,
      hasMoved: false,
    };
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.dragState) return;
    const d = this.dragState;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.hasMoved = true;
    if (!d.hasMoved) return;

    const ds = dx / this.pxPerSecond;
    const seg = this.pistas[d.srcPi]?.segmentos[d.si];
    if (!seg) return;

    if (d.type === 'move') {
      seg.startTime = Math.max(0, d.origStartTime + ds);
      const rowDelta = Math.round(dy / this.ROW_H);
      d.targetPi = Math.max(0, Math.min(d.srcPi + rowDelta, this.pistas.length));

    } else if (d.type === 'trim-left') {
      const maxTrim = seg.duration - d.origTrimEnd - 0.05;
      const newTrim = Math.max(0, Math.min(d.origTrimStart + ds, maxTrim));
      seg.startTime = Math.max(0, d.origStartTime + (newTrim - d.origTrimStart));
      seg.trimStart = newTrim;

    } else if (d.type === 'trim-right') {
      const maxTrim = seg.duration - d.origTrimStart - 0.05;
      seg.trimEnd = Math.max(0, Math.min(d.origTrimEnd - ds, maxTrim));
    }
  }

  private onPointerUp() {
    if (!this.dragState) return;
    const d = this.dragState;

    // Tap without movement = selection toggle
    if (d.type === 'move' && !d.hasMoved) {
      const same = this.selectedSeg?.pi === d.srcPi && this.selectedSeg?.si === d.si;
      this.selectedSeg = same ? null : { pi: d.srcPi, si: d.si };
      this.dragState = null;
      window.removeEventListener('pointermove', this.boundMove);
      window.removeEventListener('pointerup', this.boundUp);
      return;
    }

    if (d.type === 'move' && d.targetPi !== d.srcPi) {
      const src = this.pistas[d.srcPi];
      if (src) {
        const [seg] = src.segmentos.splice(d.si, 1);
        if (d.targetPi >= this.pistas.length) {
          this.pistas.push({
            nombre: `Pista ${this.pistas.length + 1}`,
            activa: true, color: src.color,
            efectos: { ...src.efectos }, segmentos: [seg],
          });
        } else {
          this.pistas[d.targetPi].segmentos.push(seg);
        }
        if (src.segmentos.length === 0) this.pistas.splice(d.srcPi, 1);
      }
      this.selectedSeg = null;
    }

    this.dragState = null;
    window.removeEventListener('pointermove', this.boundMove);
    window.removeEventListener('pointerup', this.boundUp);
  }

  isDraggingOver(pi: number): boolean {
    return !!(this.dragState?.type === 'move' && this.dragState?.targetPi === pi && this.dragState?.srcPi !== pi);
  }

  isNewRowTarget(): boolean {
    return !!(this.dragState?.type === 'move' && this.dragState.targetPi >= this.pistas.length);
  }
}
