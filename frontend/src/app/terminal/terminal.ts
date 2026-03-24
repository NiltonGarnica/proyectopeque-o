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

  activeUsers: ActiveUser[] = [];
  status = 'Verificando servidor...';

  private pollTimer: any = null;
  private tickTimer: any = null;
  private knownKeys = new Set<string>();

  constructor(private http: HttpClient, private cd: ChangeDetectorRef) {}

  ngOnInit() {
    this.wakeBackend();
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer)  clearInterval(this.tickTimer);
  }

  private wakeBackend() {
    this.http.get(`${API}/`).subscribe({
      next: () => {
        this.status = 'Servidor activo';
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), 3000);
        this.tickTimer  = setInterval(() => this.cd.detectChanges(), 1000);
        this.cd.detectChanges();
      },
      error: (e) => {
        this.status = `Servidor no responde (${e.status || 'timeout'}). Reintentando...`;
        this.cd.detectChanges();
        setTimeout(() => this.wakeBackend(), 8000);
      }
    });
  }

  private poll() {
    this.http.get<any[]>(`${API}/api/activity/realtime-users`).subscribe({
      next: (users) => {
        const now = Date.now();
        const incoming: ActiveUser[] = (users || []).map(u => ({
          key:      (u.email || '?') + '|' + (u.ip || '?'),
          email:    u.email || '?',
          ip:       u.ip    || '?',
          loc:      u.city && u.city !== '?' ? `${u.city}, ${u.country}` : (u.ip || '?'),
          page:     u.page  || '/',
          joinedAt: now - (u.timeOnSite || 0),
        }));

        // Update active users preserving local joinedAt
        this.activeUsers = incoming.map(u => {
          const existing = this.activeUsers.find(x => x.key === u.key);
          return existing ? { ...u, joinedAt: existing.joinedAt } : u;
        });

        this.knownKeys = new Set(incoming.map(u => u.key));
        this.cd.detectChanges();
      },
      error: (e) => {
        if (e.status === 401 || e.status === 403) {
          this.status = 'Sin permisos. Cierra sesión y vuelve a entrar.';
          if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
          if (this.tickTimer)  { clearInterval(this.tickTimer);  this.tickTimer  = null; }
          this.cd.detectChanges();
        }
      }
    });
  }

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
    const ms = Date.now() - joinedAt;
    if (!ms || ms < 1000) return '< 1s';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  }

}
