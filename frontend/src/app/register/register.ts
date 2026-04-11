import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

const API = 'https://proyectopeque-o.onrender.com';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {

  nombre = '';
  correo = '';
  telefono = '';
  password = '';
  confirmar = '';
  error = '';
  exito = '';

  constructor(private http: HttpClient, private router: Router) {}

  registrar() {
    this.error = '';
    this.exito = '';

    if (!this.nombre.trim()) { this.error = 'El nombre es obligatorio'; return; }
    if (!this.correo.trim()) { this.error = 'El correo es obligatorio'; return; }
    if (!this.password) { this.error = 'La contraseña es obligatoria'; return; }
    if (this.password.length < 6) { this.error = 'La contraseña debe tener al menos 6 caracteres'; return; }
    if (this.password !== this.confirmar) { this.error = 'Las contraseñas no coinciden'; return; }

    this.http.post<any>(`${API}/auth/register`, {
      nombre: this.nombre.trim(),
      correo: this.correo.trim(),
      telefono: this.telefono.trim() || undefined,
      contraseña: this.password
    }).subscribe({
      next: () => {
        this.exito = 'Cuenta creada. Redirigiendo...';
        setTimeout(() => this.router.navigate(['/']), 1500);
      },
      error: (err) => {
        this.error = err.error?.message || 'Error al registrar usuario';
      }
    });
  }
}
