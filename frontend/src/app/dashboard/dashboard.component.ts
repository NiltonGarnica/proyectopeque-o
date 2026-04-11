import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.css',
  standalone: false
})
export class DashboardComponent implements OnInit {

  reservas: any[] = [];
  servicio = 'grabacion';
  fecha = '';
  duracionHoras = 1;
  notas = '';

  error = '';
  errorCarga = '';
  exito = '';

  servicios = ['grabacion', 'mezcla', 'masterizacion', 'produccion'];

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.cargarReservas();
  }

  cargarReservas() {
    const userId = this.auth.getUserId();
    this.http.get<any[]>(`${API}/reservas/cliente/${userId}`).subscribe({
      next: res => this.reservas = res,
      error: () => this.errorCarga = 'No se pudieron cargar las reservas. Intenta de nuevo.'
    });
  }

  crearReserva() {
    this.error = '';
    this.exito = '';

    if (!this.fecha) { this.error = 'La fecha es obligatoria'; return; }
    if (!this.duracionHoras || this.duracionHoras < 1) { this.error = 'La duración debe ser al menos 1 hora'; return; }

    const clienteId = this.auth.getUserId();
    this.http.post(`${API}/reservas`, {
      clienteId,
      servicio: this.servicio,
      fecha: this.fecha,
      duracionHoras: this.duracionHoras,
      notas: this.notas
    }).subscribe({
      next: () => {
        this.exito = 'Reserva creada correctamente';
        this.fecha = '';
        this.notas = '';
        this.duracionHoras = 1;
        this.cargarReservas();
      },
      error: (err) => {
        this.error = err.error?.message || 'Error al crear la reserva';
      }
    });
  }

  logout() {
    this.auth.logout();
  }
}
