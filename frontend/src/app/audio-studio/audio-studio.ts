import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Pista, EfectosPista } from '../audio-timeline/audio-timeline';

const API = 'https://proyectopeque-o.onrender.com';

const COLORS = ['#3b82f6','#ec4899','#f59e0b','#10b981','#8b5cf6','#ef4444','#06b6d4','#84cc16'];

interface MezclaGuardada {
  _id: string;
  url: string;
  nombre: string;
  fecha: string;
}

@Component({
  selector: 'app-audio-studio',
  standalone: false,
  templateUrl: './audio-studio.html',
  styleUrl: './audio-studio.css',
})
export class AudioStudio implements OnInit, OnDestroy {

  pistas: Pista[] = [];
  playerSrc = '';
  reproduciendo = false;
  exportando = false;
  mensajeExport = '';
  subiendoArchivo = false;
  errorArchivo = '';
  playheadTime = 0;

  mezclas: MezclaGuardada[] = [];

  private colorIdx = 0;
  private audioContext: AudioContext | null = null;
  private playheadInterval: any = null;
  private playbackStartCtxTime = 0;
  private playbackStartTimeline = 0;

  constructor(public auth: AuthService, private zone: NgZone, private http: HttpClient) {}

  ngOnInit() { this.cargarMezclas(); }

  ngOnDestroy() { this.detenerTodas(); }

  private nextColor(): string {
    return COLORS[this.colorIdx++ % COLORS.length];
  }

  private efectosDefault(): EfectosPista {
    return { volumen: 1, eco: 0, reverb: 0, graves: 0, agudos: 0 };
  }

  private pistaNueva(url: string, nombre: string, extra: Partial<Pista> = {}): Pista {
    const p: Pista = {
      url, nombre, activa: true,
      startTime: 0, trimStart: 0, trimEnd: 0, duration: 10,
      color: this.nextColor(),
      efectos: this.efectosDefault(),
      ...extra
    };
    this.getDuration(url).then(d => p.duration = d);
    return p;
  }

  private getDuration(url: string): Promise<number> {
    return new Promise(resolve => {
      const a = new Audio(url);
      a.crossOrigin = 'anonymous';
      a.addEventListener('loadedmetadata', () => resolve(a.duration || 10), { once: true });
      a.addEventListener('error', () => resolve(10), { once: true });
      a.load();
    });
  }

  onAudioUrl(url: string) {
    const num = this.pistas.filter(p => !p.esMezcla).length + 1;
    // Place after last track
    const offset = this.pistas.length
      ? Math.max(...this.pistas.map(p => p.startTime + p.duration - p.trimStart - p.trimEnd))
      : 0;
    this.pistas.push(this.pistaNueva(url, `Pista ${num}`, { startTime: 0 }));
  }

  duplicarPista(pista: Pista) {
    const num = this.pistas.length + 1;
    this.pistas.push({
      ...pista,
      nombre: `Pista ${num} (copia)`,
      startTime: pista.startTime + (pista.duration - pista.trimStart - pista.trimEnd) + 0.1,
      efectos: { ...pista.efectos }
    });
  }

  togglePista(pista: Pista) { pista.activa = !pista.activa; }

  eliminarPista(index: number) {
    this.pistas.splice(index, 1);
    let n = 1;
    this.pistas.forEach(p => { if (!p.esMezcla) p.nombre = `Pista ${n++}`; });
  }

  previsualizarPista(url: string) { this.playerSrc = url; }

  subirArchivo(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    input.value = '';
    this.subiendoArchivo = true;
    this.errorArchivo = '';

    const formData = new FormData();
    formData.append('audio', file, file.name);

    this.http.post<any>(`${API}/api/upload-audio`, formData).subscribe({
      next: (res) => {
        this.subiendoArchivo = false;
        const nombre = file.name.replace(/\.[^.]+$/, '') || `Pista ${this.pistas.length + 1}`;
        this.pistas.push(this.pistaNueva(res.url, nombre));
      },
      error: () => { this.subiendoArchivo = false; this.errorArchivo = 'Error al subir el archivo'; }
    });
  }

  // ---- TIMELINE EVENTS ----

  onSplit({ index, tiempo }: { index: number; tiempo: number }) {
    const p = this.pistas[index];
    const splitAudio = p.trimStart + (tiempo - p.startTime);
    const first: Pista = { ...p, trimEnd: p.duration - splitAudio, efectos: { ...p.efectos } };
    const second: Pista = {
      ...p,
      nombre: p.nombre + '\'',
      startTime: tiempo,
      trimStart: splitAudio,
      efectos: { ...p.efectos }
    };
    this.pistas.splice(index, 1, first, second);
  }

  onDeleteFromTimeline(index: number) {
    this.pistas.splice(index, 1);
  }

  onSeekTo(time: number) {
    this.playheadTime = time;
  }

  // ---- PLAYBACK ----

  async mezclarYReproducir() {
    this.detenerTodas();
    const activas = this.pistas.filter(p => p.activa);
    if (!activas.length) return;

    this.mensajeExport = 'Cargando pistas...';
    this.reproduciendo = true;

    try {
      const ctx = new AudioContext();
      this.audioContext = ctx;

      const buffers = await Promise.all(activas.map(async p => {
        const res = await fetch(p.url, { mode: 'cors' });
        const ab = await res.arrayBuffer();
        return new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(ab, resolve, reject);
        });
      }));

      this.mensajeExport = '';

      const startFrom = this.playheadTime;
      const ctxStart = ctx.currentTime + 0.1;
      this.playbackStartCtxTime = ctxStart;
      this.playbackStartTimeline = startFrom;

      const promises: Promise<void>[] = [];

      activas.forEach((pista, i) => {
        const trackEnd = pista.startTime + pista.duration - pista.trimStart - pista.trimEnd;
        if (trackEnd <= startFrom) return;

        const src = ctx.createBufferSource();
        src.buffer = buffers[i];
        this.aplicarEfectos(ctx, src, pista.efectos);

        let when: number;
        let offset: number;
        let duration: number;

        if (pista.startTime >= startFrom) {
          when = ctxStart + (pista.startTime - startFrom);
          offset = pista.trimStart;
          duration = pista.duration - pista.trimStart - pista.trimEnd;
        } else {
          const seekInto = startFrom - pista.startTime;
          when = ctxStart;
          offset = pista.trimStart + seekInto;
          duration = pista.duration - offset - pista.trimEnd;
        }

        if (duration <= 0) return;
        src.start(when, offset, duration);
        promises.push(new Promise(resolve => src.addEventListener('ended', () => resolve(), { once: true })));
      });

      // Update playhead every 40ms (setInterval runs inside Angular zone via Zone.js)
      this.playheadInterval = setInterval(() => {
        this.playheadTime = this.playbackStartTimeline + (ctx.currentTime - this.playbackStartCtxTime);
      }, 40);

      if (promises.length) await Promise.all(promises);

      this.zone.run(() => {
        this.reproduciendo = false;
        this.mensajeExport = '';
        if (this.playheadInterval) { clearInterval(this.playheadInterval); this.playheadInterval = null; }
        ctx.close();
        this.audioContext = null;
      });

    } catch (err) {
      this.zone.run(() => {
        this.reproduciendo = false;
        this.mensajeExport = 'Error al cargar pistas';
        console.error(err);
        if (this.playheadInterval) { clearInterval(this.playheadInterval); this.playheadInterval = null; }
        this.audioContext?.close();
        this.audioContext = null;
      });
    }
  }

  detenerTodas() {
    this.reproduciendo = false;
    this.mensajeExport = '';
    if (this.playheadInterval) { clearInterval(this.playheadInterval); this.playheadInterval = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
  }

  // ---- EXPORT ----

  async exportarMezcla() {
    const activas = this.pistas.filter(p => p.activa);
    if (!activas.length) return;

    this.exportando = true;
    this.mensajeExport = 'Descargando pistas...';

    try {
      const audioCtx = new AudioContext();
      const buffers = await Promise.all(activas.map(async p => {
        const res = await fetch(p.url, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        return new Promise<AudioBuffer>((resolve, reject) => {
          audioCtx.decodeAudioData(ab, resolve, reject);
        });
      }));
      audioCtx.close();

      const sampleRate = buffers[0].sampleRate;
      const totalSec = Math.max(...activas.map((p, i) =>
        p.startTime + buffers[i].duration - p.trimStart - p.trimEnd
      ));

      this.mensajeExport = 'Mezclando pistas...';
      const offline = new OfflineAudioContext(2, Math.ceil(totalSec * sampleRate), sampleRate);

      activas.forEach((pista, i) => {
        const src = offline.createBufferSource();
        src.buffer = buffers[i];
        this.aplicarEfectos(offline, src, pista.efectos);
        const dur = pista.duration - pista.trimStart - pista.trimEnd;
        src.start(pista.startTime, pista.trimStart, dur);
      });

      const rendered = await offline.startRendering();
      this.mensajeExport = 'Generando archivo...';

      const wavBlob = this.audioBufferToWav(rendered);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(wavBlob);
      link.download = 'mezcla.wav';
      link.click();
      URL.revokeObjectURL(link.href);

      this.mensajeExport = 'Subiendo mezcla...';
      const formData = new FormData();
      formData.append('audio', wavBlob, 'mezcla.wav');

      this.http.post<any>(`${API}/api/upload-audio`, formData).subscribe({
        next: (res) => {
          this.zone.run(() => {
            this.exportando = false;
            this.mensajeExport = '';
            this.pistas.push({
              url: res.url, nombre: '🎚 Mezcla', activa: true, esMezcla: true,
              startTime: 0, trimStart: 0, trimEnd: 0, duration: 10,
              color: '#7c3aed', efectos: this.efectosDefault()
            });
            this.playerSrc = res.url;
            this.cargarMezclas();
          });
        },
        error: () => {
          this.zone.run(() => { this.exportando = false; this.mensajeExport = 'Error al subir la mezcla'; });
        }
      });

    } catch (err) {
      this.zone.run(() => {
        this.exportando = false;
        this.mensajeExport = 'Error al procesar la mezcla';
        console.error(err);
      });
    }
  }

  // ---- HISTORIAL ----

  cargarMezclas() {
    this.http.get<MezclaGuardada[]>(`${API}/api/mezclas`).subscribe({
      next: (data) => this.mezclas = data,
      error: () => {}
    });
  }

  eliminarMezcla(id: string) {
    this.http.delete(`${API}/api/mezclas/${id}`).subscribe({
      next: () => this.mezclas = this.mezclas.filter(m => m._id !== id),
      error: () => {}
    });
  }

  descargarMezcla(url: string, nombre: string) {
    fetch(url, { mode: 'cors' }).then(r => r.blob()).then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${nombre}.wav`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // ---- EFECTOS WEB AUDIO ----

  private aplicarEfectos(ctx: BaseAudioContext, input: AudioNode, ef: EfectosPista): void {
    const gain = ctx.createGain();
    gain.gain.value = ef.volumen;
    input.connect(gain);

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 250; bass.gain.value = ef.graves;
    gain.connect(bass);

    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf'; treble.frequency.value = 3000; treble.gain.value = ef.agudos;
    bass.connect(treble);
    treble.connect(ctx.destination);

    if (ef.eco > 0) {
      const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.3;
      const feedback = ctx.createGain(); feedback.gain.value = ef.eco * 0.6;
      const wet = ctx.createGain(); wet.gain.value = ef.eco;
      treble.connect(wet); wet.connect(delay);
      delay.connect(feedback); feedback.connect(delay);
      delay.connect(ctx.destination);
    }

    if (ef.reverb > 0) {
      const conv = ctx.createConvolver();
      conv.buffer = this.crearImpulso(ctx, 2.5, 2);
      const wet = ctx.createGain(); wet.gain.value = ef.reverb;
      treble.connect(conv); conv.connect(wet); wet.connect(ctx.destination);
    }
  }

  private crearImpulso(ctx: BaseAudioContext, dur: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const buf = ctx.createBuffer(2, Math.floor(rate * dur), rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay);
    }
    return buf;
  }

  // ---- WAV ENCODER ----

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const nCh = Math.min(buffer.numberOfChannels, 2);
    const sr = buffer.sampleRate;
    const bps = 2;
    const ba = nCh * bps;
    const samples = this.interleave(buffer, nCh);
    const dl = samples.length * bps;
    const ab = new ArrayBuffer(44 + dl);
    const v = new DataView(ab);
    this.writeStr(v, 0, 'RIFF'); v.setUint32(4, 36 + dl, true);
    this.writeStr(v, 8, 'WAVE'); this.writeStr(v, 12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, nCh, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * ba, true); v.setUint16(32, ba, true);
    v.setUint16(34, 16, true); this.writeStr(v, 36, 'data');
    v.setUint32(40, dl, true);
    let off = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  private interleave(buf: AudioBuffer, nCh: number): Float32Array {
    const chs = Array.from({ length: nCh }, (_, i) => buf.getChannelData(i));
    if (nCh === 1) return chs[0];
    const out = new Float32Array(chs[0].length * nCh);
    let idx = 0;
    for (let i = 0; i < chs[0].length; i++) for (let c = 0; c < nCh; c++) out[idx++] = chs[c][i];
    return out;
  }

  private writeStr(v: DataView, off: number, s: string) {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  }
}
