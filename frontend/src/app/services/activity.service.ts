import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

const API = 'https://proyectopeque-o.onrender.com';

@Injectable({ providedIn: 'root' })
export class ActivityService implements OnDestroy {

  private intervalId: any = null;
  private currentPage = '/';

  constructor(private http: HttpClient, private router: Router) {}

  start() {
    if (this.intervalId) return; // ya corriendo

    // Seguir cambios de ruta
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.currentPage = e.urlAfterRedirects || e.url;
    });
    this.currentPage = this.router.url;

    // Primer ping inmediato
    this.sendPing();

    // Ping cada 5 segundos
    this.intervalId = setInterval(() => this.sendPing(), 5000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private sendPing() {
    this.http.post(`${API}/api/activity/ping`, { page: this.currentPage })
      .subscribe({ error: () => {} }); // silenciar errores
  }

  ngOnDestroy() { this.stop(); }
}
