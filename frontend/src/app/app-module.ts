import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';

import { AppComponent } from './app.component';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { Register } from './register/register';
import { Proyectos } from './proyectos/proyectos';
import { Pagos } from './pagos/pagos';
import { Admin } from './admin/admin';
import { AudioPlayer } from './audio-player/audio-player';
import { AudioRecorder } from './audio-recorder/audio-recorder';
import { AudioStudio } from './audio-studio/audio-studio';
import { AudioTimeline } from './audio-timeline/audio-timeline';
import { PianoRoll } from './piano-roll/piano-roll';
import { Terminal } from './terminal/terminal';
import { Nav } from './nav/nav';
import { Particles } from './particles/particles';

@NgModule({
  declarations: [
    AppComponent,
    Nav,
    Particles,
    LoginComponent,
    DashboardComponent,
    Register,
    Proyectos,
    Pagos,
    Admin,
    AudioPlayer,
    AudioRecorder,
    AudioStudio,
    AudioTimeline,
    PianoRoll,
    Terminal,
  ],
  imports: [BrowserModule, FormsModule, HttpClientModule, AppRoutingModule],
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }],
  bootstrap: [AppComponent],
})
export class AppModule {}
