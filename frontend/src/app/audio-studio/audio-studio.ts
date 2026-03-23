import { Component, NgZone, OnDestroy } from '@angular/core';
import { AuthService } from '../services/auth.service';

interface Pista {
  url: string;
  nombre: string;
  activa: boolean;
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

  private audioElements: HTMLAudioElement[] = [];

  constructor(public auth: AuthService, private zone: NgZone) {}

  ngOnDestroy() {
    this.detenerTodas();
  }

  onAudioUrl(url: string) {
    const num = this.pistas.length + 1;
    this.pistas.push({ url, nombre: `Pista ${num}`, activa: true });
  }

  togglePista(pista: Pista) {
    pista.activa = !pista.activa;
  }

  eliminarPista(index: number) {
    this.pistas.splice(index, 1);
    // Renombrar las restantes
    this.pistas.forEach((p, i) => p.nombre = `Pista ${i + 1}`);
  }

  previsualizarPista(url: string) {
    this.playerSrc = url;
  }

  async mezclarYReproducir() {
    this.detenerTodas();

    const activas = this.pistas.filter(p => p.activa);
    if (activas.length === 0) return;

    // Crear elementos de audio
    this.audioElements = activas.map(p => {
      const a = new Audio(p.url);
      a.preload = 'auto';
      return a;
    });

    // Esperar que todas estén listas
    await Promise.all(this.audioElements.map(a =>
      new Promise<void>(resolve => {
        a.addEventListener('canplaythrough', () => resolve(), { once: true });
        a.addEventListener('error', () => resolve(), { once: true });
        a.load();
      })
    ));

    // Reproducir todas simultáneamente
    this.audioElements.forEach(a => a.play());
    this.reproduciendo = true;

    // Detectar cuando termina la más larga
    const duraciones = await Promise.all(
      this.audioElements.map(a => new Promise<void>(resolve => {
        a.addEventListener('ended', () => resolve(), { once: true });
      }))
    );

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
}
