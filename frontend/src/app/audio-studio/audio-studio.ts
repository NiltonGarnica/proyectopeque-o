import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { Pista, EfectosPista, Segmento } from '../audio-timeline/audio-timeline';

const API = 'https://proyectopeque-o.onrender.com';

const COLORS = ['#3b82f6','#ec4899','#f59e0b','#10b981','#8b5cf6','#ef4444','#06b6d4','#84cc16'];

interface MezclaGuardada {
  _id: string;
  url: string;
  nombre: string;
  fecha: string;
}

interface LiveChain {
  gain: GainNode;
  bass: BiquadFilterNode;
  treble: BiquadFilterNode;
  ecoWet: GainNode;
  reverbWet: GainNode;
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

  // Live audio nodes per pista index (only active during playback)
  liveChains = new Map<number, LiveChain>();
  velocidad = 1;

  // Karaoke
  karaokeActivo = false;
  karaokeError = '';
  karaokeEfectos: EfectosPista & { tono: number } = {
    volumen: 1, eco: 0, reverb: 0, graves: 0, agudos: 0, tono: 1
  };
  private karaokeCtx: AudioContext | null = null;
  private karaokeStream: MediaStream | null = null;
  private karaokeChain: (LiveChain & { input: GainNode }) | null = null;
  private karaokeSource: MediaStreamAudioSourceNode | null = null;
  private karaokeCaptureDest: MediaStreamAudioDestinationNode | null = null;
  private karaokeRecorder: MediaRecorder | null = null;
  private karaokeChunks: Blob[] = [];
  karaokeGrabando = false;

  private liveSources: AudioBufferSourceNode[] = [];
  private colorIdx = 0;
  private segCounter = 0;
  private audioContext: AudioContext | null = null;
  private playheadInterval: any = null;
  private playbackStartCtxTime = 0;
  private playbackStartTimeline = 0;

  constructor(public auth: AuthService, private zone: NgZone, private http: HttpClient) {}

  ngOnInit() { this.cargarMezclas(); }

  ngOnDestroy() { this.detenerTodas(); this.detenerKaraoke(); }

  private nextColor(): string { return COLORS[this.colorIdx++ % COLORS.length]; }
  private nextSegId(): number { return ++this.segCounter; }

  private efectosDefault(): EfectosPista {
    return { volumen: 1, eco: 0, reverb: 0, graves: 0, agudos: 0 };
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

  private async crearSegmento(url: string, nombre: string, startTime = 0): Promise<Segmento> {
    const duration = await this.getDuration(url);
    return { id: this.nextSegId(), url, nombre, startTime, trimStart: 0, trimEnd: 0, duration };
  }

  async onAudioUrl(url: string) {
    const num = this.pistas.length + 1;
    const nombre = `Pista ${num}`;
    const seg = await this.crearSegmento(url, nombre);
    this.zone.run(() => {
      this.pistas.push({
        nombre,
        activa: true,
        color: this.nextColor(),
        efectos: this.efectosDefault(),
        segmentos: [seg],
      });
    });
  }

  duplicarPista(pista: Pista) {
    const num = this.pistas.length + 1;
    this.pistas.push({
      nombre: `Pista ${num} (copia)`,
      activa: pista.activa,
      color: this.nextColor(),
      efectos: { ...pista.efectos },
      segmentos: pista.segmentos.map(s => ({ ...s, id: this.nextSegId() })),
    });
  }

  togglePista(pista: Pista) { pista.activa = !pista.activa; }

  eliminarPista(index: number) {
    this.pistas.splice(index, 1);
    let n = 1;
    this.pistas.forEach(p => { p.nombre = `Pista ${n++}`; });
  }

  previsualizarPista(url: string) { this.playerSrc = url; }

  previsualizarPistaObj(pista: Pista) {
    if (pista.segmentos.length > 0) this.playerSrc = pista.segmentos[0].url;
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
      next: async (res) => {
        const nombre = file.name.replace(/\.[^.]+$/, '') || `Pista ${this.pistas.length + 1}`;
        const seg = await this.crearSegmento(res.url, nombre);
        this.zone.run(() => {
          this.subiendoArchivo = false;
          this.pistas.push({
            nombre,
            activa: true,
            color: this.nextColor(),
            efectos: this.efectosDefault(),
            segmentos: [seg],
          });
        });
      },
      error: () => { this.subiendoArchivo = false; this.errorArchivo = 'Error al subir el archivo'; }
    });
  }

  onDeleteFromTimeline(index: number) {
    this.pistas.splice(index, 1);
  }

  onSeekTo(time: number) {
    this.playheadTime = time;
  }

  // ---- KARAOKE ----

  async iniciarKaraoke() {
    this.karaokeError = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      this.karaokeStream = stream;

      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.karaokeCtx = ctx;

      const source = ctx.createMediaStreamSource(stream);
      this.karaokeSource = source;

      const chain = this.crearCadenaKaraoke(ctx, this.karaokeEfectos);
      this.karaokeChain = chain;
      source.connect(chain.input);

      this.zone.run(() => { this.karaokeActivo = true; });
    } catch (err: any) {
      this.zone.run(() => {
        this.karaokeError = err?.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado'
          : 'No se pudo acceder al micrófono';
      });
    }
  }

  detenerKaraoke() {
    if (this.karaokeGrabando) this.detenerGrabacionKaraoke();
    this.karaokeActivo = false;
    this.karaokeError = '';
    this.karaokeSource?.disconnect();
    this.karaokeSource = null;
    this.karaokeStream?.getTracks().forEach(t => t.stop());
    this.karaokeStream = null;
    this.karaokeCtx?.close();
    this.karaokeCtx = null;
    this.karaokeChain = null;
    this.karaokeCaptureDest = null;
  }

  iniciarGrabacionKaraoke() {
    if (!this.karaokeCaptureDest || this.karaokeGrabando) return;
    this.karaokeChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    this.karaokeRecorder = new MediaRecorder(this.karaokeCaptureDest.stream, { mimeType });
    this.karaokeRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.karaokeChunks.push(e.data);
    };
    this.karaokeRecorder.onstop = () => { this.guardarGrabacionKaraoke(); };
    this.karaokeRecorder.start(100);
    this.karaokeGrabando = true;
  }

  detenerGrabacionKaraoke() {
    this.karaokeRecorder?.stop();
    this.karaokeGrabando = false;
  }

  private async guardarGrabacionKaraoke() {
    const blob = new Blob(this.karaokeChunks, { type: 'audio/webm' });
    const num = this.pistas.length + 1;
    const nombre = `Karaoke ${num}`;
    // Add immediately with local blob URL so user can use it right away
    const localUrl = URL.createObjectURL(blob);
    const seg = await this.crearSegmento(localUrl, nombre);
    this.zone.run(() => {
      this.pistas.push({ nombre, activa: true, color: '#8b5cf6', efectos: this.efectosDefault(), segmentos: [seg] });
    });
    // Upload in background to make it persistent
    const formData = new FormData();
    formData.append('audio', blob, `karaoke-${Date.now()}.webm`);
    this.http.post<any>(`${API}/api/upload-audio`, formData).subscribe({
      next: async (res) => {
        const dur = await this.getDuration(res.url);
        this.zone.run(() => {
          const track = this.pistas.find(p => p.nombre === nombre && p.segmentos[0]?.url === localUrl);
          if (track) { track.segmentos[0].url = res.url; track.segmentos[0].duration = dur; }
        });
      },
      error: () => {}
    });
  }

  updateKaraokeChain() {
    const chain = this.karaokeChain;
    const ctx = this.karaokeCtx;
    if (!chain || !ctx) return;
    const t = ctx.currentTime;
    const ef = this.karaokeEfectos;
    chain.gain.gain.setTargetAtTime(ef.volumen, t, 0.02);
    chain.bass.gain.setTargetAtTime(ef.graves, t, 0.02);
    chain.treble.gain.setTargetAtTime(ef.agudos, t, 0.02);
    chain.ecoWet.gain.setTargetAtTime(ef.eco, t, 0.05);
    chain.reverbWet.gain.setTargetAtTime(ef.reverb, t, 0.05);
    // Tono: shift center frequency of both EQ bands to simulate voice character
    chain.bass.frequency.setTargetAtTime(250 * ef.tono, t, 0.05);
    chain.treble.frequency.setTargetAtTime(3000 * ef.tono, t, 0.05);
  }

  private crearCadenaKaraoke(ctx: AudioContext, ef: EfectosPista & { tono: number }):
    LiveChain & { input: GainNode } {

    // Master output → speakers AND capture destination
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    this.karaokeCaptureDest = ctx.createMediaStreamDestination();
    master.connect(this.karaokeCaptureDest);

    const gain = ctx.createGain();
    gain.gain.value = ef.volumen;

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 250 * ef.tono; bass.gain.value = ef.graves;

    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf'; treble.frequency.value = 3000 * ef.tono; treble.gain.value = ef.agudos;

    gain.connect(bass);
    bass.connect(treble);
    treble.connect(master); // → master (captured + speakers)

    // Eco
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.3;
    const feedback = ctx.createGain(); feedback.gain.value = 0.6;
    const ecoWet = ctx.createGain(); ecoWet.gain.value = ef.eco;
    treble.connect(ecoWet); ecoWet.connect(delay);
    delay.connect(feedback); feedback.connect(delay);
    delay.connect(master); // → master

    // Reverb
    const conv = ctx.createConvolver();
    conv.buffer = this.crearImpulso(ctx, 2.5, 2);
    const reverbWet = ctx.createGain(); reverbWet.gain.value = ef.reverb;
    treble.connect(conv); conv.connect(reverbWet); reverbWet.connect(master); // → master

    return { input: gain, gain, bass, treble, ecoWet, reverbWet };
  }

  // ---- LIVE EFFECTS ----

  updateLiveVolumen(pistaIdx: number, ef: EfectosPista) {
    const chain = this.liveChains.get(pistaIdx);
    if (chain && this.audioContext) {
      chain.gain.gain.setTargetAtTime(ef.volumen, this.audioContext.currentTime, 0.02);
    }
  }

  updateLiveGraves(pistaIdx: number, ef: EfectosPista) {
    const chain = this.liveChains.get(pistaIdx);
    if (chain && this.audioContext) {
      chain.bass.gain.setTargetAtTime(ef.graves, this.audioContext.currentTime, 0.02);
    }
  }

  updateLiveAgudos(pistaIdx: number, ef: EfectosPista) {
    const chain = this.liveChains.get(pistaIdx);
    if (chain && this.audioContext) {
      chain.treble.gain.setTargetAtTime(ef.agudos, this.audioContext.currentTime, 0.02);
    }
  }

  updateLiveEco(pistaIdx: number, ef: EfectosPista) {
    const chain = this.liveChains.get(pistaIdx);
    if (chain && this.audioContext) {
      chain.ecoWet.gain.setTargetAtTime(ef.eco, this.audioContext.currentTime, 0.05);
    }
  }

  updateLiveReverb(pistaIdx: number, ef: EfectosPista) {
    const chain = this.liveChains.get(pistaIdx);
    if (chain && this.audioContext) {
      chain.reverbWet.gain.setTargetAtTime(ef.reverb, this.audioContext.currentTime, 0.05);
    }
  }

  updateLiveVelocidad() {
    if (!this.audioContext) return;
    const t = this.audioContext.currentTime;
    for (const src of this.liveSources) {
      src.playbackRate.setTargetAtTime(this.velocidad, t, 0.05);
    }
  }

  // ---- PLAYBACK ----

  async mezclarYReproducir() {
    this.detenerTodas();
    const activas = this.pistas.filter(p => p.activa);
    if (!activas.length) return;

    this.mensajeExport = 'Cargando pistas...';
    this.reproduciendo = true;
    this.liveChains.clear();
    this.liveSources = [];

    try {
      const ctx = new AudioContext();
      this.audioContext = ctx;

      // Flatten all segments with their parent pista info
      type SegInfo = { seg: Segmento; pistaOrigIdx: number };
      const allSegs: SegInfo[] = [];
      for (const pista of activas) {
        const origIdx = this.pistas.indexOf(pista);
        for (const seg of pista.segmentos) {
          allSegs.push({ seg, pistaOrigIdx: origIdx });
        }
      }

      const buffers = await Promise.all(allSegs.map(async ({ seg }) => {
        const res = await fetch(seg.url, { mode: 'cors' });
        const ab = await res.arrayBuffer();
        return new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(ab, resolve, reject);
        });
      }));

      this.mensajeExport = '';

      // Create ONE effect chain per active pista and store for live updates
      const chainMap = new Map<number, LiveChain & { input: GainNode }>();
      for (const pista of activas) {
        const origIdx = this.pistas.indexOf(pista);
        const chain = this.crearCadenaEfectos(ctx, pista.efectos);
        chainMap.set(origIdx, chain);
        this.liveChains.set(origIdx, chain);
      }

      const startFrom = this.playheadTime;
      const ctxStart = ctx.currentTime + 0.1;
      this.playbackStartCtxTime = ctxStart;
      this.playbackStartTimeline = startFrom;

      const promises: Promise<void>[] = [];

      allSegs.forEach(({ seg, pistaOrigIdx }, i) => {
        const chain = chainMap.get(pistaOrigIdx);
        if (!chain) return;

        const segEnd = seg.startTime + seg.duration - seg.trimStart - seg.trimEnd;
        if (segEnd <= startFrom) return;

        const src = ctx.createBufferSource();
        src.buffer = buffers[i];
        src.playbackRate.value = this.velocidad;
        this.liveSources.push(src);
        src.connect(chain.input);

        let when: number, offset: number, duration: number;

        if (seg.startTime >= startFrom) {
          when = ctxStart + (seg.startTime - startFrom);
          offset = seg.trimStart;
          duration = seg.duration - seg.trimStart - seg.trimEnd;
        } else {
          const seekInto = startFrom - seg.startTime;
          when = ctxStart;
          offset = seg.trimStart + seekInto;
          duration = seg.duration - offset - seg.trimEnd;
        }

        if (duration <= 0) return;
        src.start(when, offset, duration);
        promises.push(new Promise(resolve => src.addEventListener('ended', () => resolve(), { once: true })));
      });

      this.playheadInterval = setInterval(() => {
        this.zone.run(() => {
          this.playheadTime = this.playbackStartTimeline + (ctx.currentTime - this.playbackStartCtxTime);
        });
      }, 40);

      if (promises.length) await Promise.all(promises);

      this.zone.run(() => {
        this.reproduciendo = false;
        this.mensajeExport = '';
        this.liveChains.clear();
        this.liveSources = [];
        if (this.playheadInterval) { clearInterval(this.playheadInterval); this.playheadInterval = null; }
        ctx.close();
        this.audioContext = null;
      });

    } catch (err) {
      this.zone.run(() => {
        this.reproduciendo = false;
        this.mensajeExport = 'Error al cargar pistas';
        this.liveChains.clear();
        this.liveSources = [];
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
    this.liveChains.clear();
    this.liveSources = [];
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

      const allSegs: { seg: Segmento; efectos: EfectosPista }[] = [];
      for (const pista of activas) {
        for (const seg of pista.segmentos) {
          allSegs.push({ seg, efectos: pista.efectos });
        }
      }

      const buffers = await Promise.all(allSegs.map(async ({ seg }) => {
        const res = await fetch(seg.url, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        return new Promise<AudioBuffer>((resolve, reject) => {
          audioCtx.decodeAudioData(ab, resolve, reject);
        });
      }));
      audioCtx.close();

      const sampleRate = buffers[0].sampleRate;
      const totalSec = Math.max(...allSegs.map(({ seg }, i) =>
        seg.startTime + buffers[i].duration - seg.trimStart - seg.trimEnd
      ));

      this.mensajeExport = 'Mezclando pistas...';
      const offline = new OfflineAudioContext(2, Math.ceil(totalSec * sampleRate), sampleRate);

      allSegs.forEach(({ seg, efectos }, i) => {
        const src = offline.createBufferSource();
        src.buffer = buffers[i];
        this.aplicarEfectosOffline(offline, src, efectos);
        const dur = seg.duration - seg.trimStart - seg.trimEnd;
        src.start(seg.startTime, seg.trimStart, dur);
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
        next: async (res) => {
          const dur = await this.getDuration(res.url);
          const seg: Segmento = {
            id: this.nextSegId(), url: res.url, nombre: 'Mezcla',
            startTime: 0, trimStart: 0, trimEnd: 0, duration: dur
          };
          this.zone.run(() => {
            this.exportando = false;
            this.mensajeExport = '';
            this.pistas.push({
              nombre: '🎚 Mezcla',
              activa: true,
              color: '#7c3aed',
              efectos: this.efectosDefault(),
              segmentos: [seg],
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

  // ---- AUDIO EFFECTS ----

  // For live playback: always creates eco+reverb nodes (gain=0 if off) for real-time control
  private crearCadenaEfectos(ctx: AudioContext, ef: EfectosPista): LiveChain & { input: GainNode } {
    const gain = ctx.createGain();
    gain.gain.value = ef.volumen;

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 250; bass.gain.value = ef.graves;

    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf'; treble.frequency.value = 3000; treble.gain.value = ef.agudos;

    gain.connect(bass);
    bass.connect(treble);
    treble.connect(ctx.destination);

    // Eco — always connected, wet=0 when off (allows live activation)
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.3;
    const feedback = ctx.createGain(); feedback.gain.value = 0.6;
    const ecoWet = ctx.createGain(); ecoWet.gain.value = ef.eco;
    treble.connect(ecoWet); ecoWet.connect(delay);
    delay.connect(feedback); feedback.connect(delay);
    delay.connect(ctx.destination);

    // Reverb — always connected, wet=0 when off (allows live activation)
    const conv = ctx.createConvolver();
    conv.buffer = this.crearImpulso(ctx, 2.5, 2);
    const reverbWet = ctx.createGain(); reverbWet.gain.value = ef.reverb;
    treble.connect(conv); conv.connect(reverbWet); reverbWet.connect(ctx.destination);

    return { input: gain, gain, bass, treble, ecoWet, reverbWet };
  }

  // For offline export (no node refs needed)
  private aplicarEfectosOffline(ctx: BaseAudioContext, input: AudioNode, ef: EfectosPista): void {
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
