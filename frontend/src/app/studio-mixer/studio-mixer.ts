import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { Pista, EfectosPista } from '../audio-timeline/audio-timeline';

@Component({
  selector: 'app-studio-mixer',
  standalone: false,
  templateUrl: './studio-mixer.html',
  styleUrl: './studio-mixer.css',
})
export class StudioMixer implements OnChanges {
  @Input() pistas: Pista[] = [];
  @Input() reproduciendo = false;

  @Output() liveUpdate  = new EventEmitter<{ type: string; i: number; ef: EfectosPista }>();
  @Output() togglePista = new EventEmitter<Pista>();
  @Output() eliminar    = new EventEmitter<number>();
  @Output() duplicar    = new EventEmitter<Pista>();
  @Output() preview     = new EventEmitter<Pista>();

  soloSet   = new Set<number>();
  fxChannel: number | null = null;

  // Backup of activa states before solo was applied
  private soloBackup: boolean[] = [];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['pistas']) {
      // If pistas shrank, reset fxChannel if it now points out of bounds
      if (this.fxChannel !== null && this.fxChannel >= this.pistas.length) {
        this.fxChannel = null;
      }
      // Only reset solo when tracks are actually added or removed (not on shallow-copy reassignments)
      const prevLen: number = changes['pistas'].previousValue?.length ?? 0;
      const currLen: number = this.pistas.length;
      if (!changes['pistas'].firstChange && prevLen !== currLen && this.soloSet.size > 0) {
        this.soloSet.clear();
        this.soloBackup = [];
        this.pistas.forEach(p => { p.activa = true; });
        console.log('[Mixer] track count changed — solo cleared');
      }
    }
  }

  get hasPistas() {
    return this.pistas.some(p => p.segmentos.length > 0);
  }

  get activePistas(): { pista: Pista; index: number }[] {
    return this.pistas
      .map((p, i) => ({ pista: p, index: i }))
      .filter(x => x.pista.segmentos.length > 0);
  }

  get fxPista(): Pista | null {
    return this.fxChannel !== null ? this.pistas[this.fxChannel] ?? null : null;
  }

  onToggleMute(pista: Pista) {
    this.togglePista.emit(pista);
  }

  onToggleSolo(i: number) {
    if (this.soloSet.has(i)) {
      this.soloSet.delete(i);
    } else {
      this.soloSet.add(i);
    }
    this.applySolo();
  }

  private applySolo() {
    if (this.soloSet.size === 0) {
      // Restore backed-up states
      this.pistas.forEach((p, i) => {
        p.activa = this.soloBackup[i] !== undefined ? this.soloBackup[i] : true;
      });
      this.soloBackup = [];
      console.log('[Mixer] solo cleared — all tracks restored');
    } else {
      // First time entering solo: back up current states
      if (this.soloBackup.length === 0) {
        this.soloBackup = this.pistas.map(p => p.activa);
      }
      this.pistas.forEach((p, i) => {
        p.activa = this.soloSet.has(i);
      });
      console.log('[Mixer] solo active — soloed tracks:', [...this.soloSet]);
    }
  }

  onToggleFx(i: number) {
    this.fxChannel = this.fxChannel === i ? null : i;
  }

  onFxClose() {
    this.fxChannel = null;
  }

  onLiveUpdate(ev: { type: string; i: number; ef: EfectosPista }) {
    this.liveUpdate.emit(ev);
  }
}
