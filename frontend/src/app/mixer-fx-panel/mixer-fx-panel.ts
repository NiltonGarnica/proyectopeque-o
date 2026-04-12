import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Pista, EfectosPista } from '../audio-timeline/audio-timeline';

@Component({
  selector: 'app-mixer-fx-panel',
  standalone: false,
  templateUrl: './mixer-fx-panel.html',
  styleUrl: './mixer-fx-panel.css',
})
export class MixerFxPanel {
  @Input() pista!: Pista;
  @Input() index!: number;

  @Output() liveUpdate = new EventEmitter<{ type: string; i: number; ef: EfectosPista }>();
  @Output() close      = new EventEmitter<void>();

  emit(type: string) {
    this.liveUpdate.emit({ type, i: this.index, ef: this.pista.efectos });
  }
}
