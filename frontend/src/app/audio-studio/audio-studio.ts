import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

interface EfectosPista {
  volumen: number;
  eco: number;
  reverb: number;
  graves: number;
  agudos: number;
}

interface Pista {
  url: string;
  nombre: string;
  activa: boolean;
  esMezcla?: boolean;
  mostrarEfectos?: boolean;
  efectos: EfectosPista;
}

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

  mezclas: MezclaGuardada[] = [];

  private audioElements: HTMLAudioElement[] = [];
  private audioContext: AudioContext | null = null;

  constructor(public auth: AuthService, private zone: NgZone, private http: HttpClient) {}

  ngOnInit() {
    this.cargarMezclas();
  }

  ngOnDestroy() {
    this.detenerTodas();
  }

  private efectosDefault(): EfectosPista {
    return { volumen: 1, eco: 0, reverb: 0, graves: 0, agudos: 0 };
  }

  onAudioUrl(url: string) {
    const num = this.pistas.length + 1;
    this.pistas.push({ url, nombre: `Pista ${num}`, activa: true, efectos: this.efectosDefault() });
  }

  duplicarPista(pista: Pista) {
    const num = this.pistas.length + 1;
    this.pistas.push({
      url: pista.url,
      nombre: `Pista ${num} (copia de ${pista.nombre})`,
      activa: true,
      efectos: { ...pista.efectos }
    });
  }

  togglePista(pista: Pista) {
    pista.activa = !pista.activa;
  }

  eliminarPista(index: number) {
    this.pistas.splice(index, 1);
    let n = 1;
    this.pistas.forEach(p => {
      if (!p.esMezcla) p.nombre = `Pista ${n++}`;
    });
  }

  previsualizarPista(url: string) {
    this.playerSrc = url;
  }

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
        this.pistas.push({ url: res.url, nombre, activa: true, efectos: this.efectosDefault() });
      },
      error: () => {
        this.subiendoArchivo = false;
        this.errorArchivo = 'Error al subir el archivo';
      }
    });
  }

  async mezclarYReproducir() {
    this.detenerTodas();
    const activas = this.pistas.filter(p => p.activa);
    if (activas.length === 0) return;

    const ctx = new AudioContext();
    this.audioContext = ctx;

    this.audioElements = activas.map(p => {
      const a = new Audio(p.url);
      a.crossOrigin = 'anonymous';
      a.preload = 'auto';
      return a;
    });

    await Promise.all(this.audioElements.map(a =>
      new Promise<void>(resolve => {
        a.addEventListener('canplaythrough', () => resolve(), { once: true });
        a.addEventListener('error', () => resolve(), { once: true });
        a.load();
      })
    ));

    activas.forEach((pista, i) => {
      const source = ctx.createMediaElementSource(this.audioElements[i]);
      this.aplicarEfectos(ctx, source, pista.efectos);
    });

    this.audioElements.forEach(a => a.play());
    this.reproduciendo = true;

    await Promise.all(this.audioElements.map(a =>
      new Promise<void>(resolve => {
        a.addEventListener('ended', () => resolve(), { once: true });
      })
    ));

    this.zone.run(() => {
      this.reproduciendo = false;
      this.audioElements = [];
      ctx.close();
      this.audioContext = null;
    });
  }

  detenerTodas() {
    this.audioElements.forEach(a => { a.pause(); a.currentTime = 0; });
    this.audioElements = [];
    this.reproduciendo = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async exportarMezcla() {
    const activas = this.pistas.filter(p => p.activa);
    if (activas.length === 0) return;

    this.exportando = true;
    this.mensajeExport = 'Descargando pistas...';

    try {
      const audioCtx = new AudioContext();

      const buffers = await Promise.all(activas.map(async p => {
        const res = await fetch(p.url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Error al descargar pista: HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        return new Promise<AudioBuffer>((resolve, reject) => {
          audioCtx.decodeAudioData(arrayBuf, resolve, reject);
        });
      }));

      audioCtx.close();

      const sampleRate = buffers[0].sampleRate;
      const numChannels = 2;
      const maxFrames = Math.max(...buffers.map(b => b.length));

      this.mensajeExport = 'Mezclando pistas...';

      const offline = new OfflineAudioContext(numChannels, maxFrames, sampleRate);

      buffers.forEach((buf, i) => {
        const src = offline.createBufferSource();
        src.buffer = buf;
        this.aplicarEfectos(offline, src, activas[i].efectos);
        src.start(0);
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
              url: res.url,
              nombre: `🎚 Mezcla guardada`,
              activa: true,
              esMezcla: true,
              efectos: this.efectosDefault()
            });
            this.playerSrc = res.url;
            this.cargarMezclas();
          });
        },
        error: () => {
          this.zone.run(() => {
            this.exportando = false;
            this.mensajeExport = 'Error al subir la mezcla';
          });
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
    fetch(url, { mode: 'cors' })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${nombre}.wav`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  }

  // --- Efectos Web Audio ---

  private aplicarEfectos(ctx: BaseAudioContext, input: AudioNode, efectos: EfectosPista): void {
    const gain = ctx.createGain();
    gain.gain.value = efectos.volumen;
    input.connect(gain);

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 250;
    bass.gain.value = efectos.graves;
    gain.connect(bass);

    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 3000;
    treble.gain.value = efectos.agudos;
    bass.connect(treble);

    treble.connect(ctx.destination);

    if (efectos.eco > 0) {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.3;
      const feedback = ctx.createGain();
      feedback.gain.value = efectos.eco * 0.6;
      const echoWet = ctx.createGain();
      echoWet.gain.value = efectos.eco;

      treble.connect(echoWet);
      echoWet.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(ctx.destination);
    }

    if (efectos.reverb > 0) {
      const convolver = ctx.createConvolver();
      convolver.buffer = this.crearImpulso(ctx, 2.5, 2);
      const reverbWet = ctx.createGain();
      reverbWet.gain.value = efectos.reverb;

      treble.connect(convolver);
      convolver.connect(reverbWet);
      reverbWet.connect(ctx.destination);
    }
  }

  private crearImpulso(ctx: BaseAudioContext, duracion: number, decaimiento: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duracion);
    const impulso = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulso.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decaimiento);
      }
    }
    return impulso;
  }

  // --- WAV encoder ---

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = Math.min(buffer.numberOfChannels, 2);
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const samples = this.interleave(buffer, numChannels);
    const dataLength = samples.length * bytesPerSample;
    const ab = new ArrayBuffer(44 + dataLength);
    const view = new DataView(ab);

    this.writeStr(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeStr(view, 8, 'WAVE');
    this.writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeStr(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([ab], { type: 'audio/wav' });
  }

  private interleave(buffer: AudioBuffer, numChannels: number): Float32Array {
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    if (numChannels === 1) return channels[0];

    const result = new Float32Array(channels[0].length * numChannels);
    let idx = 0;
    for (let i = 0; i < channels[0].length; i++) {
      for (let c = 0; c < numChannels; c++) {
        result[idx++] = channels[c][i];
      }
    }
    return result;
  }

  private writeStr(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
