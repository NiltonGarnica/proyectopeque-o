import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs/operators';

const API = 'https://proyectopeque-o.onrender.com';

interface UserActivity {
  email: string;
  ip: string;
  city: string;
  country: string;
  page: string;
  timeOnSite: number;
}

@Component({
  selector: 'app-terminal',
  standalone: false,
  templateUrl: './terminal.html',
  styleUrl: './terminal.css',
})
export class Terminal implements OnInit, OnDestroy {
  @ViewChild('logEl') logEl!: ElementRef<HTMLDivElement>;

  lines: string[] = [];
  status = 'Conectando...';
  private intervalId: any = null;
  private pingOk = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.addLine('▶ Terminal Powersound iniciada...');
    this.checkBackend();
    this.intervalId = setInterval(() => this.fetch(), 3000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  // Verifica que el backend esté vivo primero
  private checkBackend() {
    this.addLine('▶ Verificando conexión con el servidor...');
    this.http.get(`${API}/`).pipe(timeout(12000)).subscribe({
      next: () => {
        this.addLine('▶ Servidor OK. Escuchando usuarios activos...');
        this.status = 'EN VIVO';
        this.pingOk = true;
        this.fetch();
      },
      error: (err) => {
        const msg = err.name === 'TimeoutError'
          ? 'Servidor tardó demasiado en responder (free tier despertando). Reintentando...'
          : `Error de conexión: ${err.status || err.message}`;
        this.addLine(`▶ ⚠ ${msg}`);
        this.status = 'Reconectando...';
        // Reintenta en 10s
        setTimeout(() => this.checkBackend(), 10000);
      }
    });
  }

  private fetch() {
    if (!this.pingOk) return;
    this.http.get<UserActivity[]>(`${API}/api/activity/realtime-users`)
      .pipe(timeout(8000))
      .subscribe({
        next: (users) => {
          this.status = 'EN VIVO';
          const ts = this.timestamp();
          if (!users || users.length === 0) {
            this.addLine(`[${ts}] — Sin usuarios activos`);
          } else {
            this.addLine(`[${ts}] ● ${users.length} usuario(s) activo(s):`);
            users.forEach(u => {
              const time  = this.formatTime(u.timeOnSite);
              const email = u.email || '(sin email — re-inicia sesión)';
              const loc   = (u.city && u.city !== '?') ? `${u.city}, ${u.country}` : u.ip;
              this.addLine(`  └─ ${email}  |  ${u.ip}  |  ${loc}  |  ${u.page}  |  ⏱ ${time}`);
            });
          }
        },
        error: (err) => {
          this.status = 'Error';
          const msg = err.name === 'TimeoutError' ? 'timeout' : `HTTP ${err.status}`;
          this.addLine(`[${this.timestamp()}] ✖ Error (${msg}) — reintentando...`);
          if (err.status === 401 || err.status === 403) {
            this.addLine('  └─ Asegúrate de estar logueado como admin');
            this.pingOk = false;
          }
        }
      });
  }

  private addLine(text: string) {
    this.lines.push(text);
    if (this.lines.length > 200) this.lines.shift();
    setTimeout(() => {
      const el = this.logEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  private timestamp(): string {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');
  }

  private formatTime(ms: number): string {
    if (ms < 1000) return '< 1s';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  }

  clearTerminal() {
    this.lines = [];
    this.addLine('▶ Terminal limpiada.');
  }
}
