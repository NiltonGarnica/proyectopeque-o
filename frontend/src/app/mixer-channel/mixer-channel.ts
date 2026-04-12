import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Pista, EfectosPista } from '../audio-timeline/audio-timeline';

@Component({
  selector: 'app-mixer-channel',
  standalone: false,
  templateUrl: './mixer-channel.html',
  styleUrl: './mixer-channel.css',
})
export class MixerChannel {
  @Input() pista!: Pista;
  @Input() index!: number;
  @Input() reproduciendo = false;
  @Input() isSolo = false;
  @Input() fxOpen = false;

  @Output() liveUpdate   = new EventEmitter<{ type: string; i: number; ef: EfectosPista }>();
  @Output() toggleMute   = new EventEmitter<Pista>();
  @Output() toggleSolo   = new EventEmitter<number>();
  @Output() toggleFx     = new EventEmitter<number>();
  @Output() eliminar     = new EventEmitter<number>();
  @Output() duplicar     = new EventEmitter<Pista>();
  @Output() preview      = new EventEmitter<Pista>();

  emit(type: string) {
    this.liveUpdate.emit({ type, i: this.index, ef: this.pista.efectos });
  }
}
