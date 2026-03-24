import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-nav',
  standalone: false,
  templateUrl: './nav.html',
  styleUrl: './nav.css',
})
export class Nav {
  menuOpen = false;

  constructor(public auth: AuthService, private router: Router) {}

  logout() {
    this.auth.logout();
    this.router.navigate(['/']);
  }

  toggle() {
    this.menuOpen = !this.menuOpen;
  }

  close() {
    this.menuOpen = false;
  }
}
