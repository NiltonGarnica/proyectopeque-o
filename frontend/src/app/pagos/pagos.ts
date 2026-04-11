import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

@Component({
  selector: 'app-pagos',
  standalone: false,
  templateUrl: './pagos.html',
  styleUrl: './pagos.css',
})
export class Pagos implements OnInit {

  pagos: any[] = [];
  reservas: any[] = [];
  proyectos: any[] = [];

  mostrarFormulario = false;
  error = '';
  exito = '';

  monto: number | null = null;
  metodo = 'efectivo';
  referencia = '';
  reservaId = '';
  proyectoId = '';

  metodos = ['efectivo', 'transferencia', 'tarjeta'];

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.cargarPagos();
    this.cargarReservas();
    this.cargarProyectos();
  }

  cargarPagos() {
    const userId = this.auth.getUserId();
    this.http.get<any[]>(`${API}/pagos/cliente/${userId}`).subscribe({
      next: res => this.pagos = res,
      error: () => this.error = 'Error al cargar pagos'
    });
  }

  cargarReservas() {
    const userId = this.auth.getUserId();
    this.http.get<any[]>(`${API}/reservas/cliente/${userId}`).subscribe({
      next: res => this.reservas = res,
      error: () => { /* silencioso: es opcional para el formulario */ }
    });
  }

  cargarProyectos() {
    const userId = this.auth.getUserId();
    this.http.get<any[]>(`${API}/proyectos/cliente/${userId}`).subscribe({
      next: res => this.proyectos = res,
      error: () => { /* silencioso: es opcional para el formulario */ }
    });
  }

  registrarPago() {
    this.error = '';
    this.exito = '';

    if (!this.monto || this.monto <= 0) {
      this.error = 'Ingresa un monto válido mayor a 0';
      return;
    }

    const body: any = {
      clienteId: this.auth.getUserId(),
      monto: this.monto,
      metodo: this.metodo,
      referencia: this.referencia.trim() || undefined
    };

    if (this.reservaId) body.reservaId = this.reservaId;
    if (this.proyectoId) body.proyectoId = this.proyectoId;

    this.http.post<any>(`${API}/pagos`, body).subscribe({
      next: () => {
        this.exito = 'Pago registrado correctamente';
        this.monto = null;
        this.referencia = '';
        this.reservaId = '';
        this.proyectoId = '';
        this.mostrarFormulario = false;
        this.cargarPagos();
      },
      error: (err) => {
        this.error = err.error?.message || 'Error al registrar pago';
      }
    });
  }

  totalPagado(): number {
    return this.pagos
      .filter(p => p.estado === 'completado')
      .reduce((sum, p) => sum + p.monto, 0);
  }

  totalPendientes(): number {
    return this.pagos.filter(p => p.estado === 'pendiente').length;
  }

  estadoColor(estado: string): string {
    const colores: any = {
      pendiente: '#f59e0b',
      completado: '#22c55e',
      rechazado: '#ef4444'
    };
    return colores[estado] || '#94a3b8';
  }
}
