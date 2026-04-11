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
    this.error = '';
    this.http.get<any[]>(`${API}/reservas`).subscribe({
      next: res => this.reservas = res,
      error: () => this.error = 'Error al cargar reservas'
    });
    this.http.get<any[]>(`${API}/pagos`).subscribe({
      next: res => this.pagos = res,
      error: () => this.error = 'Error al cargar pagos'
    });
    this.http.get<any[]>(`${API}/proyectos`).subscribe({
      next: res => this.proyectos = res,
      error: () => this.error = 'Error al cargar proyectos'
    });
  }

  cambiarEstadoReserva(id: string, estado: string) {
    this.error = '';
    this.http.patch(`${API}/reservas/${id}/estado`, { estado }).subscribe({
      next: () => { this.exito = 'Estado actualizado'; this.cargarTodo(); },
      error: (err) => this.error = err.error?.message || 'Error al actualizar'
    });
  }

  cambiarEstadoPago(id: string, estado: string) {
    this.error = '';
    this.http.patch(`${API}/pagos/${id}/estado`, { estado }).subscribe({
      next: () => { this.exito = 'Estado actualizado'; this.cargarTodo(); },
      error: (err) => this.error = err.error?.message || 'Error al actualizar'
    });
  }

  cambiarEstadoProyecto(id: string, estado: string) {
    this.error = '';
    this.http.patch(`${API}/proyectos/${id}/estado`, { estado }).subscribe({
      next: () => { this.exito = 'Estado actualizado'; this.cargarTodo(); },
      error: (err) => this.error = err.error?.message || 'Error al actualizar'
    });
  }

  eliminarReserva(id: string) {
    if (!confirm('¿Eliminar esta reserva?')) return;
    this.http.delete(`${API}/reservas/${id}`).subscribe({
      next: () => this.cargarTodo(),
      error: (err) => this.error = err.error?.message || 'Error al eliminar'
    });
  }

  eliminarProyecto(id: string) {
    if (!confirm('¿Eliminar este proyecto?')) return;
    this.http.delete(`${API}/proyectos/${id}`).subscribe({
      next: () => this.cargarTodo(),
      error: (err) => this.error = err.error?.message || 'Error al eliminar'
    });
  }

  openTerminal() {
    const w = 900, h = 600;
    const left = Math.round((screen.width - w) / 2);
    const top  = Math.round((screen.height - h) / 2);
    window.open(
      '/admin/terminal',
      'terminalWindow',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes`
    );
  }

  totalPagos(): number {
    return this.pagos.filter(p => p.estado === 'completado').reduce((s, p) => s + p.monto, 0);
  }

  pagosPorCliente(): { nombre: string; correo: string; pagos: any[]; total: number }[] {
    const mapa = new Map<string, { nombre: string; correo: string; pagos: any[]; total: number }>();
    for (const p of this.pagos) {
      const id = p.clienteId?._id || p.clienteId || 'sin-cliente';
      if (!mapa.has(id)) {
        mapa.set(id, {
          nombre: p.clienteId?.nombre || 'Sin nombre',
          correo: p.clienteId?.correo || '—',
          pagos: [],
          total: 0
        });
      }
      const entry = mapa.get(id)!;
      entry.pagos.push(p);
      if (p.estado === 'completado') entry.total += p.monto;
    }
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
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
