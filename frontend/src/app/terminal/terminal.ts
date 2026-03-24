import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API = 'https://proyectopeque-o.onrender.com';

interface DisplayUser {
  email: string;
  ip: string;
  loc: string;
  page: string;
  firstVisit: number;   // ms epoch from server
  lastActive: number;   // ms epoch from server (updated each poll)
  elapsed: string;      // formatted locally every tick
}

@Component({
  selector: 'app-terminal',
  standalone: false,
  templateUrl: './terminal.html',
  styleUrl: './terminal.css',
})
export class Terminal implements OnInit, OnDestroy {

  users: DisplayUser[] = [];
  statusLines: string[] = [];
  private pollTimer: any = null;
  private tickTimer: any = null;
  private ready = false;

  constructor(private http: HttpClient, private cd: ChangeDetectorRef) {}

  ngOnInit() {
    this.status('▶ Terminal iniciada. Verificando servidor...');
    this.wakeBackend();
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  private wakeBackend() {
    this.http.get(`${API}/`).subscribe({
      next: () => {
        this.status('▶ Servidor activo. Escuchando usuarios...');
        this.ready = true;
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), 3000);
        this.tickTimer = setInterval(() => this.tick(), 1000);
      },
      error: (e) => {
        this.status(`▶ Servidor no responde (${e.status || 'timeout'}). Reintentando en 8s...`);
        setTimeout(() => this.wakeBackend(), 8000);
      }
    });
  }

  private poll() {
    this.http.get<any[]>(`${API}/api/activity/realtime-users`).subscribe({
      next: (data) => {
        const now = Date.now();
        const incoming = (data || []).map(u => ({
          email: u.email || '?',
          ip: u.ip || '?',
          loc: u.city && u.city !== '?' ? `${u.city}, ${u.country}` : (u.ip || '?'),
          page: u.page || '/',
          // server sends timeOnSite = lastActive - firstVisit (ms)
          firstVisit: now - (u.timeOnSite || 0),
          lastActive: now,
          elapsed: this.fmt(u.timeOnSite || 0),
        }));

        // Merge: update existing, add new, remove gone
        const keys = new Set(incoming.map(u => u.email + u.ip));
        // Remove users no longer active
        this.users = this.users.filter(u => keys.has(u.email + u.ip));
        // Update / add
        for (const u of incoming) {
          const idx = this.users.findIndex(x => x.email === u.email && x.ip === u.ip);
          if (idx >= 0) {
            this.users[idx].page = u.page;
            this.users[idx].lastActive = u.lastActive;
            this.users[idx].firstVisit = u.firstVisit;
          } else {
            this.users.push(u);
          }
        }

        if (incoming.length === 0) {
          this.status(`[${this.ts()}] Sin usuarios activos`);
        }
        this.cd.detectChanges();
      },
      error: (e) => {
        this.status(`[${this.ts()}] Error ${e.status}: ${e.statusText || e.message}`);
        if (e.status === 401 || e.status === 403) {
          this.status('  → Cierra sesión y vuelve a entrar como admin.');
          this.ready = false;
          if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
          if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
        }
        this.cd.detectChanges();
      }
    });
  }

  private tick() {
    const now = Date.now();
    for (const u of this.users) {
      u.elapsed = this.fmt(now - u.firstVisit);
    }
    this.cd.detectChanges();
  }

  private status(text: string) {
    this.statusLines = [...this.statusLines.slice(-9), text];
    this.cd.detectChanges();
  }

  private ts(): string {
    return new Date().toTimeString().slice(0, 8);
  }

  private fmt(ms: number): string {
    if (!ms || ms < 1000) return '< 1s';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  }

  clear() {
    this.statusLines = [];
    this.users = [];
    this.status('▶ Terminal limpiada.');
  }
}
