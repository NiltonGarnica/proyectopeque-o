import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

@Component({
  selector: 'app-admin',
  standalone: false,
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {

  seccion: 'reservas' | 'pagos' | 'proyectos' = 'reservas';

  reservas: any[] = [];
  pagos: any[] = [];
  proyectos: any[] = [];

  estadosReserva = ['pendiente', 'confirmada', 'cancelada', 'completada'];
  estadosPago = ['pendiente', 'completado', 'rechazado'];
  estadosProyecto = ['en_progreso', 'revision', 'completado', 'entregado'];

  error = '';
  exito = '';

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.cargarTodo();
  }

  cargarTodo() {
    this.http.get<any[]>(`${API}/reservas`).subscribe({ next: res => this.reservas = res });
    this.http.get<any[]>(`${API}/pagos`).subscribe({ next: res => this.pagos = res });
    this.http.get<any[]>(`${API}/proyectos`).subscribe({ next: res => this.proyectos = res });
  }

  cambiarEstadoReserva(id: string, estado: string) {
    this.http.patch(`${API}/reservas/${id}/estado`, { estado }).subscribe({
      next: () => { this.exito = 'Estado actualizado'; this.cargarTodo(); },
      error: () => this.error = 'Error al actualizar'
    });
  }

  cambiarEstadoPago(id: string, estado: string) {
    this.http.patch(`${API}/pagos/${id}/estado`, { estado }).subscribe({
      next: () => { this.exito = 'Estado actualizado'; this.cargarTodo(); },
      error: () => this.error = 'Error al actualizar'
    });
  }

  cambiarEstadoProyecto(id: string, estado: string) {
    this.http.patch(`${API}/proyectos/${id}/estado`, { estado }).subscribe({
      next: () => { this.exito = 'Estado actualizado'; this.cargarTodo(); },
      error: () => this.error = 'Error al actualizar'
    });
  }

  eliminarReserva(id: string) {
    if (!confirm('¿Eliminar esta reserva?')) return;
    this.http.delete(`${API}/reservas/${id}`).subscribe({
      next: () => this.cargarTodo(),
      error: () => this.error = 'Error al eliminar'
    });
  }

  eliminarProyecto(id: string) {
    if (!confirm('¿Eliminar este proyecto?')) return;
    this.http.delete(`${API}/proyectos/${id}`).subscribe({
      next: () => this.cargarTodo(),
      error: () => this.error = 'Error al eliminar'
    });
  }

  totalPagos(): number {
    return this.pagos.filter(p => p.estado === 'completado').reduce((s, p) => s + p.monto, 0);
  }

  estadoColorReserva(estado: string): string {
    const c: any = { pendiente: '#f59e0b', confirmada: '#3b82f6', cancelada: '#ef4444', completada: '#22c55e' };
    return c[estado] || '#94a3b8';
  }

  estadoColorPago(estado: string): string {
    const c: any = { pendiente: '#f59e0b', completado: '#22c55e', rechazado: '#ef4444' };
    return c[estado] || '#94a3b8';
  }

  estadoColorProyecto(estado: string): string {
    const c: any = { en_progreso: '#f59e0b', revision: '#3b82f6', completado: '#22c55e', entregado: '#8b5cf6' };
    return c[estado] || '#94a3b8';
  }
}
