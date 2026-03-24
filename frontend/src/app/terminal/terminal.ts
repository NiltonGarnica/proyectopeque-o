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
  private pollTimer: any = null;
  private ready = false;

  constructor(private http: HttpClient, private cd: ChangeDetectorRef) {}

  ngOnInit() {
    this.log('▶ Terminal iniciada. Verificando servidor...');
    this.wakeBackend();
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private wakeBackend() {
    this.http.get(`${API}/`).subscribe({
      next: () => {
        this.log('▶ Servidor activo. Escuchando usuarios...');
        this.ready = true;
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), 3000);
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
          const header =
            '         ' +
            this.pad('EMAIL', 25) + ' | ' +
            this.pad('IP', 15) + ' | ' +
            this.pad('CIUDAD', 15) + ' | ' +
            this.pad('PÁGINA', 20) + ' | ' +
            'TIEMPO';
          this.log(header);
          this.log('         ' + '-'.repeat(98));
          for (const u of users) {
            const loc = u.city && u.city !== '?' ? `${u.city}, ${u.country}` : u.ip;
            const line =
              `[${t}] ` +
              this.pad(u.email || '?', 25) + ' | ' +
              this.pad(u.ip || '?', 15) + ' | ' +
              this.pad(loc, 15) + ' | ' +
              this.pad(u.page || '/', 20) + ' | ' +
              this.fmt(u.timeOnSite);
            this.log(line);
          }
        }
      },
      error: (e) => {
        this.log(`[${this.ts()}] Error ${e.status}: ${e.statusText || e.message}`);
        if (e.status === 401 || e.status === 403) {
          this.log('  → Cierra sesión y vuelve a entrar como admin.');
          this.ready = false;
          if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
        }
      }
    });
  }

  private pad(text: string, length: number): string {
    const str = (text || '').substring(0, length);
    return str.padEnd(length, ' ');
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

  clear() {
    this.lines = [];
    this.log('▶ Terminal limpiada.');
  }
}
