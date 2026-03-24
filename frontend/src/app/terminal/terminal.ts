import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API = 'https://proyectopeque-o.onrender.com';

@Component({
  selector: 'app-terminal',
  standalone: false,
  templateUrl: './terminal.html',
  styleUrl: './terminal.css',
})
export class Terminal implements OnInit, OnDestroy {

  lines: string[] = [];
  private timer: any = null;
  private ready = false;

  constructor(private http: HttpClient, private cd: ChangeDetectorRef) {}

  ngOnInit() {
    this.log('▶ Terminal iniciada. Verificando servidor...');
    this.wakeBackend();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Espera a que el backend responda (free-tier puede tardar ~30s)
  private wakeBackend() {
    this.http.get(`${API}/`).subscribe({
      next: () => {
        this.log('▶ Servidor activo. Escuchando usuarios...');
        this.ready = true;
        this.poll();
        this.timer = setInterval(() => this.poll(), 3000);
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
        const t = this.ts();
        if (!users || users.length === 0) {
          this.log(`[${t}] Sin usuarios activos`);
        } else {
          this.log(`[${t}] ● ${users.length} usuario(s):`);
          for (const u of users) {
            const loc  = u.city && u.city !== '?' ? `${u.city}, ${u.country}` : u.ip;
            const time = this.fmt(u.timeOnSite);
            this.log(`  ${u.email || '?'}  |  ${u.ip}  |  ${loc}  |  ${u.page}  |  ${time}`);
          }
        }
      },
      error: (e) => {
        this.log(`[${this.ts()}] Error ${e.status}: ${e.statusText || e.message}`);
        if (e.status === 401 || e.status === 403) {
          this.log('  → Cierra sesión y vuelve a entrar como admin.');
          this.ready = false;
          if (this.timer) { clearInterval(this.timer); this.timer = null; }
        }
      }
    });
  }

  private log(text: string) {
    this.lines = [...this.lines, text];
    if (this.lines.length > 300) this.lines = this.lines.slice(-300);
    this.cd.detectChanges();
    // scroll al fondo
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

  clear() {
    this.lines = [];
    this.log('▶ Terminal limpiada.');
  }
}
