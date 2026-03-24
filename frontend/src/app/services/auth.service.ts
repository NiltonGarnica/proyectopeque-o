import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';

const API = 'https://proyectopeque-o.onrender.com';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private activityRef: { start: () => void; stop: () => void } | null = null;

  constructor(private http: HttpClient, private router: Router) {}

  setActivity(svc: { start: () => void; stop: () => void }) {
    this.activityRef = svc;
  }

  login(correo: string, contraseña: string) {
    return this.http.post<any>(`${API}/auth/login`, { correo, contraseña }).pipe(
      tap(res => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('userId', res.userId);
        localStorage.setItem('nombre', res.nombre);
        localStorage.setItem('rol', res.rol);
        this.activityRef?.start();
      })
    );
  }

  logout() {
    this.activityRef?.stop();
    localStorage.clear();
    this.router.navigate(['/']);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getRol(): string {
    return localStorage.getItem('rol') || '';
  }

  getUserId(): string {
    return localStorage.getItem('userId') || '';
  }

  getNombre(): string {
    return localStorage.getItem('nombre') || '';
  }
}
