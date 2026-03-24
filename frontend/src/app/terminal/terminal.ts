import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API = 'https://proyectopeque-o.onrender.com';

interface ActiveUser {
  key: string;
  email: string;
  ip: string;
  loc: string;
  page: string;
  joinedAt: number;
}

@Component({
  selector: 'app-terminal',
  standalone: false,
  templateUrl: './terminal.html',
  styleUrl: './terminal.css',
})
export class Terminal implements OnInit, OnDestroy {

  // Event log — only appends on new users
  lines: string[] = [];

  // Live table — updated in place every tick
  activeUsers: ActiveUser[] = [];

  private pollTimer: any = null;
  private tickTimer: any = null;
  private knownKeys = new Set<string>();

  constructor(private http: HttpClient, private cd: ChangeDetectorRef) {}

  ngOnInit() {
    this.log('▶ Terminal iniciada. Verificando servidor...');
    this.wakeBackend();
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer)  clearInterval(this.tickTimer);
  }

  private wakeBackend() {
    this.http.get(`${API}/`).subscribe({
      next: () => {
        this.log('▶ Servidor activo. Escuchando...');
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), 3000);
        this.tickTimer  = setInterval(() => this.cd.detectChanges(), 1000);
      },
      error: (e) => {
        this.log(`▶ Servidor no responde (${e.status || 'timeout'}). Reintentando en 8s...`);
        setTimeout(() => this.wakeBackend(), 8000);
      }
    });
  }

  private poll() {
    this.http.get<any[]>(`${API}/api/activity/realtime-users`).subscribe({
      next: (users) => {
        const now = Date.now();
        const incoming = (users || []).map(u => {
          const key = (u.email || '?') + '|' + (u.ip || '?');
          return {
            key,
            email: u.email || '?',
            ip:    u.ip    || '?',
            loc:   u.city && u.city !== '?' ? `${u.city}, ${u.country}` : (u.ip || '?'),
            page:  u.page  || '/',
            joinedAt: now - (u.timeOnSite || 0),
          };
        });

        const incomingKeys = new Set(incoming.map(u => u.key));

        // Detect NEW users → append to log
        for (const u of incoming) {
          if (!this.knownKeys.has(u.key)) {
            this.knownKeys.add(u.key);
            this.log(
              `[${this.ts()}] NUEVO  ` +
              this.pad(u.email, 25) + ' | ' +
              this.pad(u.ip,    15) + ' | ' +
              this.pad(u.loc,   18) + ' | ' +
              u.page
            );
          }
        }

        // Detect users that LEFT → log + remove
        for (const key of Array.from(this.knownKeys)) {
          if (!incomingKeys.has(key)) {
            this.knownKeys.delete(key);
            const gone = this.activeUsers.find(u => u.key === key);
            if (gone) {
              this.log(`[${this.ts()}] SALIÓ  ${gone.email}`);
            }
          }
        }

        // Update live table (page may change, keep joinedAt)
        this.activeUsers = incoming.map(u => {
          const existing = this.activeUsers.find(x => x.key === u.key);
          return { ...u, joinedAt: existing ? existing.joinedAt : u.joinedAt };
        });

        this.cd.detectChanges();
      },
      error: (e) => {
        this.log(`[${this.ts()}] Error ${e.status}: ${e.statusText || e.message}`);
        if (e.status === 401 || e.status === 403) {
          this.log('  → Cierra sesión y vuelve a entrar como admin.');
          if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
          if (this.tickTimer)  { clearInterval(this.tickTimer);  this.tickTimer  = null; }
        }
      }
    });
  }

  // Returns a formatted row string for the live table
  formatUser(u: ActiveUser): string {
    return (
      this.pad(u.email, 25) + ' | ' +
      this.pad(u.ip,    15) + ' | ' +
      this.pad(u.loc,   18) + ' | ' +
      this.pad(u.page,  20) + ' | ' +
      this.elapsed(u.joinedAt)
    );
  }

  pad(text: string, length: number): string {
    return (text || '').substring(0, length).padEnd(length, ' ');
  }

  elapsed(joinedAt: number): string {
    return this.fmt(Date.now() - joinedAt);
  }

  private log(text: string) {
    this.lines.push(text);
    if (this.lines.length > 100) this.lines = this.lines.slice(-100);
    this.cd.detectChanges();
    setTimeout(() => {
      const el = document.querySelector('.term-log');
      if (el) el.scrollTop = el.scrollHeight;
    }, 20);
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

  openPopup() {
    const w = 900, h = 600;
    const left = Math.round((screen.width - w) / 2);
    const top  = Math.round((screen.height - h) / 2);
    window.open(
      '/admin/terminal',
      'terminalWindow',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes`
    );
  }

  clear() {
    this.lines = [];
    this.log('▶ Terminal limpiada.');
  }
}
