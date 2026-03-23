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

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    DashboardComponent,
    Register,
    Proyectos,
    Pagos,
    Admin,
  ],
  imports: [BrowserModule, FormsModule, HttpClientModule, AppRoutingModule],
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }],
  bootstrap: [AppComponent],
})
export class AppModule {}
