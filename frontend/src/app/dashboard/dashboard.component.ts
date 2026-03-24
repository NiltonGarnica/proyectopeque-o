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

  servicios = ['grabacion', 'mezcla', 'masterizacion', 'produccion'];

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.cargarReservas();
  }

  cargarReservas() {
    const userId = this.auth.getUserId();
    this.http.get<any[]>(`${API}/reservas/cliente/${userId}`)
      .subscribe(res => this.reservas = res);
  }

  crearReserva() {
    const clienteId = this.auth.getUserId();
    this.http.post(`${API}/reservas`, {
      clienteId,
      servicio: this.servicio,
      fecha: this.fecha,
      duracionHoras: this.duracionHoras,
      notas: this.notas
    }).subscribe(() => {
      this.fecha = '';
      this.notas = '';
      this.duracionHoras = 1;
      this.cargarReservas();
    });
  }

  logout() {
    this.auth.logout();
  }
}
