import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

interface Particle {
  left: string;
  fontSize: string;
  duration: string;
  delay: string;
  opacity: string;
  note: string;
  drift: string;
}

@Component({
  selector: 'app-particles',
  standalone: false,
  templateUrl: './particles.html',
  styleUrl: './particles.css',
})
export class Particles implements OnInit, OnDestroy {

  visible = true;
  particles: Particle[] = [];
  private sub: Subscription | null = null;

  private readonly NOTES = ['♩', '♪', '♫', '♬'];

  constructor(private router: Router) {}

  ngOnInit() {
    this.particles = Array.from({ length: 28 }, () => ({
      left:     `${Math.random() * 100}%`,
      fontSize: `${10 + Math.random() * 18}px`,
      duration: `${18 + Math.random() * 22}s`,
      delay:    `-${Math.random() * 20}s`,       // negative delay = start mid-animation
      opacity:  `${0.12 + Math.random() * 0.22}`,
      note:     this.NOTES[Math.floor(Math.random() * this.NOTES.length)],
      drift:    `${(Math.random() - 0.5) * 60}px`,
    }));

    this.visible = !this.router.url.includes('/admin/terminal');

    this.sub = this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.visible = !e.urlAfterRedirects.includes('/admin/terminal');
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  trackByIdx(i: number) { return i; }
}
