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
  contraseña = '';
  confirmar = '';
  error = '';
  exito = '';

  constructor(private http: HttpClient, private router: Router) {}

  registrar() {
    this.error = '';
    this.exito = '';

    if (this.contraseña !== this.confirmar) {
      this.error = 'Las contraseñas no coinciden';
      return;
    }

    this.http.post<any>(`${API}/auth/register`, {
      nombre: this.nombre,
      correo: this.correo,
      telefono: this.telefono,
      contraseña: this.contraseña
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
