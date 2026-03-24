import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { ActivityService } from './services/activity.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false
})
export class AppComponent implements OnInit {

  constructor(public auth: AuthService, private activity: ActivityService) {}

  ngOnInit() {
    // Registrar referencia antes de cualquier acción
    this.auth.setActivity(this.activity);

    // Si ya hay sesión activa, arrancar pings inmediatamente
    if (this.auth.isLoggedIn()) {
      this.activity.start();
    }
  }
}
