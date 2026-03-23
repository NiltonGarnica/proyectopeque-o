import { Component, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

interface Pista {
  url: string;
  nombre: string;
  activa: boolean;
  esMezcla?: boolean;
}

@Component({
  selector: 'app-audio-studio',
  standalone: false,
  templateUrl: './audio-studio.html',
  styleUrl: './audio-studio.css',
})
export class AudioStudio implements OnDestroy {

  pistas: Pista[] = [];
  playerSrc = '';
  reproduciendo = false;
  exportando = false;
  mensajeExport = '';

  private audioElements: HTMLAudioElement[] = [];

  constructor(public auth: AuthService, private zone: NgZone, private http: HttpClient) {}

  ngOnDestroy() {
    this.detenerTodas();
  }

  onAudioUrl(url: string) {
    const num = this.pistas.length + 1;
    this.pistas.push({ url, nombre: `Pista ${num}`, activa: true });
  }

  duplicarPista(pista: Pista) {
    const num = this.pistas.length + 1;
    this.pistas.push({ url: pista.url, nombre: `Pista ${num} (copia de ${pista.nombre})`, activa: true });
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

  async mezclarYReproducir() {
    this.detenerTodas();
    const activas = this.pistas.filter(p => p.activa);
    if (activas.length === 0) return;

    this.audioElements = activas.map(p => {
      const a = new Audio(p.url);
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
    });
  }

  detenerTodas() {
    this.audioElements.forEach(a => { a.pause(); a.currentTime = 0; });
    this.audioElements = [];
    this.reproduciendo = false;
  }

  async exportarMezcla() {
    const activas = this.pistas.filter(p => p.activa);
    if (activas.length === 0) return;

    this.exportando = true;
    this.mensajeExport = 'Descargando pistas...';

    try {
      const audioCtx = new AudioContext();

      // Descargar y decodificar todas las pistas activas
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

      // Renderizar con OfflineAudioContext
      const offline = new OfflineAudioContext(numChannels, maxFrames, sampleRate);

      buffers.forEach(buf => {
        const src = offline.createBufferSource();
        src.buffer = buf;
        src.connect(offline.destination);
        src.start(0);
      });

      const rendered = await offline.startRendering();

      this.mensajeExport = 'Generando archivo...';

      // Convertir a WAV
      const wavBlob = this.audioBufferToWav(rendered);

      // Subir a Cloudinary
      this.mensajeExport = 'Subiendo mezcla...';
      const formData = new FormData();
      formData.append('audio', wavBlob, 'mezcla.wav');

      this.http.post<any>(`${API}/api/upload-audio`, formData).subscribe({
        next: (res) => {
          this.zone.run(() => {
            this.exportando = false;
            this.mensajeExport = '';
            const num = this.pistas.length + 1;
            this.pistas.push({
              url: res.url,
              nombre: `🎚 Mezcla guardada`,
              activa: true,
              esMezcla: true
            });
            this.playerSrc = res.url;
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
