import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Sampler, Offline, loaded } from 'tone';
import { AuthService } from '../services/auth.service';
import { StudioBusService } from '../services/studio-bus.service';
import { Pista, EfectosPista, Segmento, Pattern } from '../audio-timeline/audio-timeline';
import { PianoNote } from '../audio-piano-roll/audio-piano-roll';

const API = 'https://proyectopeque-o.onrender.com';

const COLORS = ['#3b82f6','#ec4899','#f59e0b','#10b981','#8b5cf6','#ef4444','#06b6d4','#84cc16'];

const NOTE_NAMES_S = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const PIANO_BASE   = 'https://tonejs.github.io/audio/salamander/';
const PIANO_URLS: Record<string,string> = {
  A0:'A0.mp3',C1:'C1.mp3','D#1':'Ds1.mp3','F#1':'Fs1.mp3',
  A1:'A1.mp3',C2:'C2.mp3','D#2':'Ds2.mp3','F#2':'Fs2.mp3',
  A2:'A2.mp3',C3:'C3.mp3','D#3':'Ds3.mp3','F#3':'Fs3.mp3',
  A3:'A3.mp3',C4:'C4.mp3','D#4':'Ds4.mp3','F#4':'Fs4.mp3',
  A4:'A4.mp3',C5:'C5.mp3','D#5':'Ds5.mp3','F#5':'Fs5.mp3',
  A5:'A5.mp3',C6:'C6.mp3','D#6':'Ds6.mp3','F#6':'Fs6.mp3',
  A6:'A6.mp3',C7:'C7.mp3','D#7':'Ds7.mp3','F#7':'Fs7.mp3',
  A7:'A7.mp3',C8:'C8.mp3',
};

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

  // ── Floating window visibility ──────────────
  wins: Record<string, boolean> = {
    archivos: false,
    preview:  false,
    grabador: false,
    karaoke:  false,
    pianoAdv: false,
    pianoSim: false,
    mixer:    false,
    mezclas:  false,
  };

  // ── Z-index per window (managed via focusWindow) ──
  private _zCounter = 200;
  wZ: Record<string, number> = {
    archivos: 200, preview: 201, grabador: 202, karaoke: 203,
    pianoAdv: 204, pianoSim: 205, mixer: 206, mezclas: 207,
  };

  toggleWindow(name: string) {
    this.wins[name] = !this.wins[name];
    if (this.wins[name]) this.focusWindow(name);
  }

  openWindow(name: string) {
    this.wins[name] = true;
    this.focusWindow(name);
  }

  focusWindow(name: string) {
    this.wZ[name] = ++this._zCounter;
  }

  closeWindow(name: string) {
    this.wins[name] = false;
  }

  // ── Patterns ─────────────────────────────────────────
  patterns: Pattern[] = [];
  activePatternId: number | null = null;
  private patternCounter = 0;

  get activePattern(): Pattern | null {
    if (this.activePatternId == null) return null;
    return this.patterns.find(p => p.id === this.activePatternId) || null;
  }

  createPattern(event: { pi: number; startTime: number }) {
    const id = ++this.patternCounter;
    const color = this.nextColor();
    const bpm = 120;
    const duracion = 4; // 1 bar default
    const pattern: Pattern = { id, nombre: `Pattern ${id}`, instrumento: 'piano', notas: [], color, duracion, bpm };
    this.patterns.push(pattern);
    const durSec = (duracion / bpm) * 60;
    const seg: Segmento = {
      id: this.nextSegId(), tipo: 'pattern', patternId: id,
      url: '', nombre: pattern.nombre,
      startTime: event.startTime, trimStart: 0, trimEnd: 0, duration: durSec,
    };
    this.pistas[event.pi]?.segmentos.push(seg);
    this.pistas = [...this.pistas];
    this.activePatternId = id;
    this.openWindow('pianoAdv');
  }

  onSelectPattern(id: number) {
    this.activePatternId = id;
    this.openWindow('pianoAdv');
  }

  onPatternNotesChanged(notes: PianoNote[]) {
    const pat = this.activePattern;
    if (!pat) return;
    pat.notas = notes;
    if (notes.length) {
      const lastBeat = Math.max(...notes.map(n => n.start + n.duration));
      const bars = Math.ceil(lastBeat / 4);
      pat.duracion = Math.max(4, bars * 4);
      const durSec = (pat.duracion / pat.bpm) * 60;
      for (const pista of this.pistas) {
        for (const s of pista.segmentos) {
          if (s.patternId === pat.id) { s.duration = durSec; s.nombre = pat.nombre; }
        }
      }
    }
  }

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
  karaokeUrlLocal = '';   // URL descargable de la última grabación karaoke

  private liveSources: AudioBufferSourceNode[] = [];
  private colorIdx = 0;
  private segCounter = 0;
  private audioContext: AudioContext | null = null;
  private playheadInterval: any = null;
  private playbackStartCtxTime = 0;
  private playbackStartTimeline = 0;
  private busSub!: Subscription;

  constructor(
    public auth: AuthService,
    private zone: NgZone,
    private http: HttpClient,
    private studioBus: StudioBusService,
  ) {}

  ngOnInit() {
    this.initDefaultTracks();
    this.cargarMezclas();
    this.busSub = this.studioBus.open$.subscribe(name => {
      if (name) { this.openWindow(name); this.studioBus.consume(); }
    });
  }

  private initDefaultTracks() {
    if (this.pistas.length > 0) return; // already initialised (route reuse)
    this.pistas = [
      { nombre: 'Track 1', activa: true, color: COLORS[0], efectos: this.efectosDefault(), segmentos: [] },
      { nombre: 'Track 2', activa: true, color: COLORS[1], efectos: this.efectosDefault(), segmentos: [] },
      { nombre: 'Track 3', activa: true, color: COLORS[2], efectos: this.efectosDefault(), segmentos: [] },
      { nombre: 'Track 4', activa: true, color: COLORS[3], efectos: this.efectosDefault(), segmentos: [] },
    ];
    this.colorIdx = 4;
  }

  /** Fills the first empty track slot; creates a new track if all slots are occupied. */
  private addSegmentToTrack(nombre: string, seg: Segmento, color?: string) {
    const empty = this.pistas.find(p => p.segmentos.length === 0);
    if (empty) {
      empty.nombre = nombre;
      if (color) empty.color = color;
      empty.segmentos.push(seg);
    } else {
      this.pistas.push({
        nombre,
        activa: true,
        color: color || this.nextColor(),
        efectos: this.efectosDefault(),
        segmentos: [seg],
      });
    }
  }

  get hasClips(): boolean {
    return this.pistas.some(p => p.activa && p.segmentos.length > 0);
  }

  ngOnDestroy() { this.detenerTodas(); this.detenerKaraoke(); this.busSub?.unsubscribe(); }

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

  async onPianoTrack(event: { url: string; nombre: string }) {
    const seg = await this.crearSegmento(event.url, event.nombre);
    this.zone.run(() => {
      this.addSegmentToTrack(event.nombre, seg);
      this.pistas = [...this.pistas];
    });
  }

  async onAudioUrl(url: string) {
    const nombre = `Grabación ${Date.now() % 10000}`;
    const seg = await this.crearSegmento(url, nombre);
    this.zone.run(() => { this.addSegmentToTrack(nombre, seg); });
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
        const nombre = file.name.replace(/\.[^.]+$/, '') || `Audio ${this.pistas.length + 1}`;
        const seg = await this.crearSegmento(res.url, nombre);
        this.zone.run(() => {
          this.subiendoArchivo = false;
          this.addSegmentToTrack(nombre, seg);
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
    // Detener recorder si sigue activo
    if (this.karaokeGrabando) {
      try { this.karaokeRecorder?.stop(); } catch {}
      this.karaokeGrabando = false;
    }

    // Apagar el micrófono inmediatamente (quita el indicador del navegador)
    try { this.karaokeStream?.getTracks().forEach(t => t.stop()); } catch {}
    this.karaokeStream = null;

    // Desconectar el grafo de audio
    try { this.karaokeSource?.disconnect(); } catch {}
    this.karaokeSource = null;

    this.karaokeChain = null;
    this.karaokeCaptureDest = null;
    this.karaokeActivo = false;
    this.karaokeError = '';

    // Cerrar el contexto con un pequeño delay para que el recorder termine de volcar datos
    const ctx = this.karaokeCtx;
    this.karaokeCtx = null;
    setTimeout(() => { try { ctx?.close(); } catch {} }, 400);
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
      this.karaokeUrlLocal = localUrl;
      this.addSegmentToTrack(nombre, seg, '#8b5cf6');
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

  descargarKaraoke() {
    if (!this.karaokeUrlLocal) return;
    const a = document.createElement('a');
    a.href = this.karaokeUrlLocal;
    a.download = `karaoke-${Date.now()}.webm`;
    a.click();
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

  // ---- PATTERN RENDERING ----

  private midiToNoteName(pitch: number): string {
    return NOTE_NAMES_S[pitch % 12] + (Math.floor(pitch / 12) - 1);
  }

  private getPatternSamplerCfg(inst: string) {
    if (inst === 'guitar')
      return { urls: {'A2':'A2.mp3','A3':'A3.mp3','A4':'A4.mp3','B2':'B2.mp3','B3':'B3.mp3','C3':'C3.mp3','C4':'C4.mp3','C5':'C5.mp3','D3':'D3.mp3','D4':'D4.mp3','D5':'D5.mp3','E2':'E2.mp3','E3':'E3.mp3','E4':'E4.mp3','F3':'F3.mp3','F4':'F4.mp3','G2':'G2.mp3','G3':'G3.mp3','G4':'G4.mp3'}, baseUrl:'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/', release:1.2 };
    if (inst === 'guitar-electric')
      return { urls: {'A2':'A2.mp3','A3':'A3.mp3','A4':'A4.mp3','A5':'A5.mp3','C3':'C3.mp3','C4':'C4.mp3','C5':'C5.mp3','C6':'C6.mp3','C#2':'Cs2.mp3','D#3':'Ds3.mp3','D#4':'Ds4.mp3','D#5':'Ds5.mp3','E2':'E2.mp3','F#2':'Fs2.mp3','F#3':'Fs3.mp3','F#4':'Fs4.mp3','F#5':'Fs5.mp3'}, baseUrl:'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-electric/', release:1.0 };
    if (inst === 'bass')
      return { urls: {'A#1':'As1.mp3','A#2':'As2.mp3','A#3':'As3.mp3','A#4':'As4.mp3','C#1':'Cs1.mp3','C#2':'Cs2.mp3','C#3':'Cs3.mp3','C#4':'Cs4.mp3','C#5':'Cs5.mp3','E1':'E1.mp3','E2':'E2.mp3','E3':'E3.mp3','E4':'E4.mp3','G1':'G1.mp3','G2':'G2.mp3','G3':'G3.mp3','G4':'G4.mp3'}, baseUrl:'https://nbrosowsky.github.io/tonejs-instruments/samples/bass-electric/', release:1.5 };
    return { urls: PIANO_URLS, baseUrl: PIANO_BASE, release: 1.5 };
  }

  /** Offline-render a Pattern's notes to an AudioBuffer in the given context. */
  private async renderPatternToBuffer(pattern: Pattern, ctx: AudioContext): Promise<AudioBuffer | null> {
    const valid = (pattern.notas as PianoNote[]).filter(n => n.duration > 0);
    if (!valid.length) return null;
    const spb      = 60 / pattern.bpm;
    const totalSec = Math.max(...valid.map(n => (n.start + n.duration) * spb)) + 1.5;
    const cfg      = this.getPatternSamplerCfg(pattern.instrumento);

    const toneBuffer = await Offline(async () => {
      const s = new Sampler({ urls: cfg.urls, release: cfg.release, baseUrl: cfg.baseUrl }).toDestination();
      await loaded();
      for (const note of valid) {
        s.triggerAttackRelease(this.midiToNoteName(note.pitch), note.duration * spb, note.start * spb, note.velocity);
      }
    }, totalSec, 2);

    // Copy data into a buffer that belongs to the playback AudioContext
    const src: any = (toneBuffer as any).get?.() ?? toneBuffer;
    const dst = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let ch = 0; ch < src.numberOfChannels; ch++) dst.getChannelData(ch).set(src.getChannelData(ch));
    return dst;
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

      // ── Collect audio segments (skip patterns)
      type SegInfo = { seg: Segmento; pistaOrigIdx: number };
      const allSegs: SegInfo[] = [];
      const patternSegs: SegInfo[] = [];
      for (const pista of activas) {
        const origIdx = this.pistas.indexOf(pista);
        for (const seg of pista.segmentos) {
          if (seg.tipo === 'pattern') {
            const pat = this.patterns.find(p => p.id === seg.patternId);
            if (pat && pat.notas.length) patternSegs.push({ seg, pistaOrigIdx: origIdx });
          } else {
            allSegs.push({ seg, pistaOrigIdx: origIdx });
          }
        }
      }

      // ── Fetch audio + render patterns in parallel
      if (patternSegs.length) this.mensajeExport = 'Renderizando patterns…';

      const [audioBuffers, patternBuffers] = await Promise.all([
        Promise.all(allSegs.map(async ({ seg }) => {
          const res = await fetch(seg.url, { mode: 'cors' });
          const ab = await res.arrayBuffer();
          return new Promise<AudioBuffer>((resolve, reject) => { ctx.decodeAudioData(ab, resolve, reject); });
        })),
        Promise.all(patternSegs.map(({ seg }) => {
          const pat = this.patterns.find(p => p.id === seg.patternId)!;
          return this.renderPatternToBuffer(pat, ctx);
        })),
      ]);

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

      // ── Schedule audio clips
      allSegs.forEach(({ seg, pistaOrigIdx }, i) => {
        const chain = chainMap.get(pistaOrigIdx);
        if (!chain) return;
        const segEnd = seg.startTime + seg.duration - seg.trimStart - seg.trimEnd;
        if (segEnd <= startFrom) return;
        const src = ctx.createBufferSource();
        src.buffer = audioBuffers[i];
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

      // ── Schedule pattern buffers
      patternSegs.forEach(({ seg, pistaOrigIdx }, i) => {
        const buf = patternBuffers[i];
        if (!buf) return;
        const chain = chainMap.get(pistaOrigIdx);
        if (!chain) return;
        const segEnd = seg.startTime + seg.duration;
        if (segEnd <= startFrom) return;
        const bSrc = ctx.createBufferSource();
        bSrc.buffer = buf;
        bSrc.playbackRate.value = this.velocidad;
        this.liveSources.push(bSrc);
        bSrc.connect(chain.input);
        let when: number, offset: number, duration: number;
        if (seg.startTime >= startFrom) {
          when = ctxStart + (seg.startTime - startFrom);
          offset = 0;
          duration = buf.duration;
        } else {
          const seekInto = startFrom - seg.startTime;
          if (seekInto >= buf.duration) return;
          when = ctxStart;
          offset = seekInto;
          duration = buf.duration - seekInto;
        }
        if (duration <= 0) return;
        bSrc.start(when, offset, duration);
        promises.push(new Promise(resolve => bSrc.addEventListener('ended', () => resolve(), { once: true })));
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
      const patSegs:  { seg: Segmento; efectos: EfectosPista }[] = [];
      for (const pista of activas) {
        for (const seg of pista.segmentos) {
          if (seg.tipo === 'pattern') {
            const pat = this.patterns.find(p => p.id === seg.patternId);
            if (pat && pat.notas.length) patSegs.push({ seg, efectos: pista.efectos });
          } else {
            allSegs.push({ seg, efectos: pista.efectos });
          }
        }
      }

      if (patSegs.length) this.mensajeExport = 'Renderizando patterns…';

      const [audioBuffers, patBuffers] = await Promise.all([
        Promise.all(allSegs.map(async ({ seg }) => {
          const res = await fetch(seg.url, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          return new Promise<AudioBuffer>((resolve, reject) => { audioCtx.decodeAudioData(ab, resolve, reject); });
        })),
        Promise.all(patSegs.map(({ seg }) => {
          const pat = this.patterns.find(p => p.id === seg.patternId)!;
          return this.renderPatternToBuffer(pat, audioCtx);
        })),
      ]);
      audioCtx.close();

      const allBufs  = [...audioBuffers, ...patBuffers.filter((b): b is AudioBuffer => !!b)];
      const allItems = [
        ...allSegs.map((s, i) => ({ seg: s.seg, efectos: s.efectos, buf: audioBuffers[i], offset: s.seg.trimStart, dur: s.seg.duration - s.seg.trimStart - s.seg.trimEnd })),
        ...patSegs.map((s, i) => patBuffers[i] ? { seg: s.seg, efectos: s.efectos, buf: patBuffers[i]!, offset: 0, dur: patBuffers[i]!.duration } : null).filter(Boolean) as any[],
      ];

      if (!allBufs.length) { this.exportando = false; this.mensajeExport = ''; return; }
      const sampleRate = allBufs[0].sampleRate;
      const totalSec   = Math.max(...allItems.map(it => it.seg.startTime + it.dur));

      this.mensajeExport = 'Mezclando pistas...';
      const offline = new OfflineAudioContext(2, Math.ceil(totalSec * sampleRate), sampleRate);

      allItems.forEach(({ seg, efectos, buf, offset, dur }) => {
        const src = offline.createBufferSource();
        src.buffer = buf;
        this.aplicarEfectosOffline(offline, src, efectos);
        src.start(seg.startTime, offset, dur);
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
