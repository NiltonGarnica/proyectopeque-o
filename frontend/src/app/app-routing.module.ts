import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { Register } from './register/register';
import { Proyectos } from './proyectos/proyectos';
import { Pagos } from './pagos/pagos';
import { Admin } from './admin/admin';
import { AuthGuard } from './guards/auth.guard';
import { AdminGuard } from './guards/admin.guard';

const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'register', component: Register },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: 'proyectos', component: Proyectos, canActivate: [AuthGuard] },
  { path: 'pagos', component: Pagos, canActivate: [AuthGuard] },
  { path: 'admin', component: Admin, canActivate: [AdminGuard] }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
