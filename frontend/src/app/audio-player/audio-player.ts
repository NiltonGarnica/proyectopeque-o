import { Component, Input, OnChanges, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';

@Component({
  selector: 'app-audio-player',
  standalone: false,
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayer implements OnChanges, AfterViewInit, OnDestroy {

  @Input() src = '';
  @ViewChild('audioEl') audioRef!: ElementRef<HTMLAudioElement>;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  progress = 0;
  playbackRate = 1;

  rates = [0.5, 0.75, 1, 1.25, 1.5, 2];

  private get audio(): HTMLAudioElement {
    return this.audioRef?.nativeElement;
  }

  ngAfterViewInit() {
    if (this.src) this.audio.load();
  }

  ngOnChanges() {
    if (this.audio && this.src) {
      this.audio.load();
      this.isPlaying = false;
      this.currentTime = 0;
      this.progress = 0;
    }
  }

  ngOnDestroy() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
  }

  togglePlay() {
    if (!this.src || !this.audio) return;
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
    this.isPlaying = !this.isPlaying;
  }

  onTimeUpdate() {
    this.currentTime = this.audio.currentTime;
    this.duration = this.audio.duration || 0;
    this.progress = this.duration ? (this.currentTime / this.duration) * 100 : 0;
  }

  onLoadedMetadata() {
    this.duration = this.audio.duration;
  }

  onEnded() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.progress = 0;
  }

  seek(event: Event) {
    const val = Number((event.target as HTMLInputElement).value);
    const time = (val / 100) * this.duration;
    this.audio.currentTime = time;
    this.currentTime = time;
  }

  changeRate(rate: number) {
    this.playbackRate = rate;
    this.audio.playbackRate = rate;
  }

  formatTime(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}
