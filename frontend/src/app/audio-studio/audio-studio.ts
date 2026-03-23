import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-audio-studio',
  standalone: false,
  templateUrl: './audio-studio.html',
  styleUrl: './audio-studio.css',
})
export class AudioStudio {

  playerSrc = '';
  historial: string[] = [];

  constructor(public auth: AuthService) {}

  onAudioUrl(url: string) {
    this.playerSrc = url;
    this.historial.unshift(url);
  }

  cargarEnReproductor(url: string) {
    this.playerSrc = url;
  }
}
