import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { StudioBusService } from '../services/studio-bus.service';

@Component({
  selector: 'app-nav',
  standalone: false,
  templateUrl: './nav.html',
  styleUrl: './nav.css',
})
export class Nav implements OnInit, OnDestroy {

  menuOpen       = false;
  studioExpanded = false;

  private routerSub!: Subscription;

  constructor(
    public  auth:      AuthService,
    private router:    Router,
    private studioBus: StudioBusService,
  ) {}

  ngOnInit() {
    // Auto-expand if already on /studio
    this.studioExpanded = this.router.url.includes('/studio');

    // Keep expanded whenever the route is /studio
    this.routerSub = this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      if ((e as NavigationEnd).url.includes('/studio')) {
        this.studioExpanded = true;
      }
    });
  }

  ngOnDestroy() { this.routerSub?.unsubscribe(); }

  logout() { this.auth.logout(); this.router.navigate(['/']); }
  toggle() { this.menuOpen = !this.menuOpen; }
  close()  { this.menuOpen = false; }

  get isOnStudio(): boolean { return this.router.url.includes('/studio'); }

  /** Click on "Estudio" parent: navigate if needed, toggle expand */
  toggleStudio(e: Event) {
    e.preventDefault();
    this.studioExpanded = !this.studioExpanded;
    if (!this.isOnStudio) {
      this.router.navigate(['/studio']);
    }
  }

  /** Click on a studio sub-item: open corresponding floating window */
  openStudioTool(name: string) {
    this.studioBus.open(name);
    if (!this.isOnStudio) {
      this.router.navigate(['/studio']);
    }
    this.close();
  }
}
