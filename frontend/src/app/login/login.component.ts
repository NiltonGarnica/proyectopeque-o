import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  standalone: false
})
export class LoginComponent {

  correo = '';
  password = '';
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  login() {
    this.error = '';

    if (!this.correo.trim()) { this.error = 'El correo es obligatorio'; return; }
    if (!this.password) { this.error = 'La contraseña es obligatoria'; return; }

    this.auth.login(this.correo.trim(), this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.error = err.error?.message || 'Correo o contraseña incorrectos';
      }
    });
  }
}
