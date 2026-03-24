import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
  private intervalId: any = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.addLine('▶ Terminal Powersound iniciada...');
    this.addLine('▶ Conectando al servidor...');
    this.fetch();
    this.intervalId = setInterval(() => this.fetch(), 3000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private fetch() {
    this.http.get<UserActivity[]>(`${API}/api/activity/realtime-users`).subscribe({
      next: (users) => {
        const ts = this.timestamp();
        if (!users || users.length === 0) {
          this.addLine(`[${ts}] — Sin usuarios activos (esperando pings...)`);
        } else {
          this.addLine(`[${ts}] ● ${users.length} usuario(s) activo(s):`);
          users.forEach(u => {
            const time  = this.formatTime(u.timeOnSite);
            const email = u.email || '(desconocido)';
            const loc   = (u.city && u.city !== '?') ? `${u.city}, ${u.country}` : u.ip;
            this.addLine(`  └─ ${email}  |  ${u.ip}  |  ${loc}  |  ${u.page}  |  ⏱ ${time}`);
          });
        }
      },
      error: (err) => {
        this.addLine(`[${this.timestamp()}] ✖ Error HTTP ${err.status}: ${err.message}`);
      }
    });
  }

  private addLine(text: string) {
    this.lines.push(text);
    // Mantener máximo 200 líneas
    if (this.lines.length > 200) this.lines.shift();
    // Auto-scroll al fondo
    setTimeout(() => {
      const el = this.logEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  private timestamp(): string {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  private formatTime(ms: number): string {
    if (ms < 1000) return '< 1s';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  }

  clearTerminal() {
    this.lines = [];
    this.addLine('▶ Terminal limpiada.');
  }
}
