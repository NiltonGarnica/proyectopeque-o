import { Component, EventEmitter, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

@Component({
  selector: 'app-audio-recorder',
  standalone: false,
  templateUrl: './audio-recorder.html',
  styleUrl: './audio-recorder.css',
})
export class AudioRecorder {

  @Output() audioUrl = new EventEmitter<string>();

  grabando = false;
  procesando = false;
  error = '';
  exito = '';
  urlLocal = '';

  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(private http: HttpClient, private auth: AuthService) {}

  async iniciarGrabacion() {
    this.error = '';
    this.exito = '';
    this.urlLocal = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        this.urlLocal = URL.createObjectURL(blob);
        stream.getTracks().forEach(t => t.stop());
        this.subirAudio(blob);
      };

      this.mediaRecorder.start();
      this.grabando = true;
    } catch {
      this.error = 'No se pudo acceder al micrófono. Verifica los permisos.';
    }
  }

  detenerGrabacion() {
    if (this.mediaRecorder && this.grabando) {
      this.mediaRecorder.stop();
      this.grabando = false;
      this.procesando = true;
    }
  }

  subirAudio(blob: Blob) {
    const formData = new FormData();
    formData.append('audio', blob, 'grabacion.webm');

    this.http.post<any>(`${API}/api/upload-audio`, formData).subscribe({
      next: (res) => {
        this.procesando = false;
        this.exito = 'Grabación subida correctamente';
        this.audioUrl.emit(res.url);
      },
      error: () => {
        this.procesando = false;
        this.error = 'Error al subir la grabación al servidor';
      }
    });
  }
}
