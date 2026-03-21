import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  standalone: false
})
export class LoginComponent {

  correo = '';
  password = '';

  constructor(private http: HttpClient, private router: Router) {}

  login() {
  this.http.post<any>('https://proyectopeque-o.onrender.com', {
    correo: this.correo,
    contraseña: this.password // 👈 aquí sí puedes dejar ñ porque es JSON
  }).subscribe(res => {
    localStorage.setItem('userId', res.userId);
    this.router.navigate(['/dashboard']);
  });
}
}