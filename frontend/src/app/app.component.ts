import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { ActivityService } from './services/activity.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false
})
export class AppComponent implements OnInit {

  constructor(private auth: AuthService, private activity: ActivityService) {}

  ngOnInit() {
    this.auth.setActivity(this.activity);
    if (this.auth.isLoggedIn()) {
      this.activity.start();
    }
  }
}
