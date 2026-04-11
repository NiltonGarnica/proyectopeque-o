import { Injectable } from '@angular/core';
import { RouteReuseStrategy, ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AppRouteReuseStrategy implements RouteReuseStrategy {

  private handles = new Map<string, DetachedRouteHandle>();

  private key(route: ActivatedRouteSnapshot): string {
    return route.routeConfig?.path || '';
  }

  /** Siempre guardar el componente al salir de la ruta */
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return !!route.routeConfig?.path;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (handle) {
      this.handles.set(this.key(route), handle);
    }
  }

  /** Reusar el componente guardado si existe */
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return this.handles.has(this.key(route));
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return this.handles.get(this.key(route)) ?? null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  /** Llamar al hacer logout para no filtrar datos entre sesiones */
  clearAll(): void {
    this.handles.clear();
  }
}
