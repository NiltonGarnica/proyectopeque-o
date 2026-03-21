import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  standalone: false
})
export class DashboardComponent implements OnInit {

  texto = '';
  actividades: any[] = [];
  userId = '';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.userId = localStorage.getItem('userId') || '';
    this.cargarActividades();
  }

  crearActividad() {
    this.http.post('http://localhost:3000/actividad', {
      texto: this.texto,
      userId: this.userId
    }).subscribe(() => {
      this.texto = '';
      this.cargarActividades();
    });
  }

  cargarActividades() {
    this.http.get<any[]>(`http://localhost:3000/actividades/${this.userId}`)
      .subscribe(res => {
        this.actividades = res;
      });
  }
}