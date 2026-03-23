import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

const API = 'https://proyectopeque-o.onrender.com';

@Component({
  selector: 'app-proyectos',
  standalone: false,
  templateUrl: './proyectos.html',
  styleUrl: './proyectos.css',
})
export class Proyectos implements OnInit {

  proyectos: any[] = [];
  proyectoSeleccionado: any = null;

  // Formulario nuevo proyecto
  titulo = '';
  descripcion = '';
  genero = '';
  mostrarFormulario = false;

  // Subida de archivos
  archivoSeleccionado: File | null = null;
  subiendoArchivo = false;
  mensajeArchivo = '';

  error = '';

  constructor(private http: HttpClient, public auth: AuthService) {}

  ngOnInit() {
    this.cargarProyectos();
  }

  cargarProyectos() {
    const userId = this.auth.getUserId();
    this.http.get<any[]>(`${API}/proyectos/cliente/${userId}`)
      .subscribe({
        next: res => this.proyectos = res,
        error: () => this.error = 'Error al cargar proyectos'
      });
  }

  crearProyecto() {
    this.error = '';
    this.http.post<any>(`${API}/proyectos`, {
      clienteId: this.auth.getUserId(),
      titulo: this.titulo,
      descripcion: this.descripcion,
      genero: this.genero
    }).subscribe({
      next: () => {
        this.titulo = '';
        this.descripcion = '';
        this.genero = '';
        this.mostrarFormulario = false;
        this.cargarProyectos();
      },
      error: () => this.error = 'Error al crear proyecto'
    });
  }

  seleccionarProyecto(proyecto: any) {
    this.proyectoSeleccionado = proyecto;
    this.mensajeArchivo = '';
    this.archivoSeleccionado = null;
  }

  onArchivoSeleccionado(event: any) {
    this.archivoSeleccionado = event.target.files[0] || null;
  }

  subirArchivo() {
    if (!this.archivoSeleccionado || !this.proyectoSeleccionado) return;

    this.subiendoArchivo = true;
    this.mensajeArchivo = '';

    const formData = new FormData();
    formData.append('archivo', this.archivoSeleccionado);

    this.http.post<any>(`${API}/proyectos/${this.proyectoSeleccionado._id}/archivos`, formData)
      .subscribe({
        next: res => {
          this.subiendoArchivo = false;
          this.mensajeArchivo = 'Archivo subido correctamente';
          this.archivoSeleccionado = null;
          this.proyectoSeleccionado = res.proyecto;
          this.cargarProyectos();
        },
        error: () => {
          this.subiendoArchivo = false;
          this.mensajeArchivo = 'Error al subir archivo';
        }
      });
  }

  cerrarDetalle() {
    this.proyectoSeleccionado = null;
  }

  estadoColor(estado: string): string {
    const colores: any = {
      en_progreso: '#f59e0b',
      revision: '#3b82f6',
      completado: '#22c55e',
      entregado: '#8b5cf6'
    };
    return colores[estado] || '#94a3b8';
  }
}
