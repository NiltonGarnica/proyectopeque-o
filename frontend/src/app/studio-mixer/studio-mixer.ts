import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Pista, EfectosPista } from '../audio-timeline/audio-timeline';

@Component({
  selector: 'app-studio-mixer',
  standalone: false,
  templateUrl: './studio-mixer.html',
  styleUrl: './studio-mixer.css',
})
export class StudioMixer {
  @Input() pistas: Pista[] = [];
  @Input() reproduciendo = false;

  @Output() liveUpdate  = new EventEmitter<{ type: string; i: number; ef: EfectosPista }>();
  @Output() togglePista = new EventEmitter<Pista>();
  @Output() eliminar    = new EventEmitter<number>();

  // Visual-only solo: stores the index of the currently soloed channel (null = none)
  soloActive: number | null = null;

  onToggleSolo(i: number) {
    this.soloActive = this.soloActive === i ? null : i;
  }

  // trackBy by index — stable identity, no object recreation
  trackByIndex(i: number): number { return i; }
}
