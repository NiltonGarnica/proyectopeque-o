import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Bridges the main nav sidebar and AudioStudio.
 * When the user clicks a studio sub-item in the nav,
 * this service emits the window name; AudioStudio listens
 * and opens the corresponding floating window.
 */
@Injectable({ providedIn: 'root' })
export class StudioBusService {
  private _win = new BehaviorSubject<string | null>(null);
  readonly open$ = this._win.asObservable();

  open(name: string)  { this._win.next(name); }
  consume()           { this._win.next(null); }
}
