import {
  Component, Input, Output, EventEmitter,
  OnInit, OnDestroy, NgZone, ElementRef, HostBinding
} from '@angular/core';

@Component({
  selector: 'app-studio-window',
  standalone: false,
  templateUrl: './studio-window.html',
  styleUrl: './studio-window.css',
})
export class StudioWindow implements OnInit, OnDestroy {

  @Input() title   = '';
  @Input() icon    = '🔲';
  @Input() initialX = 80;
  @Input() initialY = 60;
  @Input() initialW = 600;
  @Input() initialH = 400;
  @Input() minW    = 260;
  @Input() minH    = 120;
  @Input() zIndex  = 10;
  @Input() visible = false;

  @Output() closed  = new EventEmitter<void>();
  @Output() focused = new EventEmitter<void>();

  readonly TITLE_H = 36;

  x = 80; y = 60; w = 600; h = 400;
  minimized = false;

  private drag:   { sx: number; sy: number; ox: number; oy: number } | null = null;
  private resize: { sx: number; sy: number; ow: number; oh: number } | null = null;

  private readonly moveFn = (e: MouseEvent) => this.zone.run(() => this.onMove(e));
  private readonly upFn   = ()              => this.zone.run(() => this.onEnd());

  constructor(private zone: NgZone, private el: ElementRef) {}

  ngOnInit() {
    this.x = this.initialX;
    this.y = this.initialY;
    this.w = this.initialW;
    this.h = this.initialH;
  }

  /* Host is a zero-size, overflow-visible anchor at workspace origin */
  @HostBinding('style.position') readonly _pos   = 'absolute';
  @HostBinding('style.top')      readonly _top   = '0';
  @HostBinding('style.left')     readonly _left  = '0';
  @HostBinding('style.width')    readonly _w     = '0';
  @HostBinding('style.height')   readonly _h     = '0';
  @HostBinding('style.overflow') readonly _ov    = 'visible';
  @HostBinding('style.pointerEvents') readonly _pe = 'none';

  onWindowClick() { this.focused.emit(); }

  onClose(e: MouseEvent) {
    e.stopPropagation();
    this.closed.emit();
  }

  toggleMinimize(e: MouseEvent) {
    e.stopPropagation();
    this.minimized = !this.minimized;
  }

  startDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.sw-actions')) return;
    e.preventDefault();
    this.focused.emit();
    this.drag = { sx: e.clientX, sy: e.clientY, ox: this.x, oy: this.y };
    window.addEventListener('mousemove', this.moveFn);
    window.addEventListener('mouseup', this.upFn);
  }

  startResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.focused.emit();
    this.resize = { sx: e.clientX, sy: e.clientY, ow: this.w, oh: this.h };
    window.addEventListener('mousemove', this.moveFn);
    window.addEventListener('mouseup', this.upFn);
  }

  private onMove(e: MouseEvent) {
    const parent = this.el.nativeElement.parentElement;
    if (this.drag) {
      const maxX = parent ? parent.clientWidth  - 60       : 3000;
      const maxY = parent ? parent.clientHeight - this.TITLE_H : 3000;
      this.x = Math.max(0, Math.min(maxX, this.drag.ox + (e.clientX - this.drag.sx)));
      this.y = Math.max(0, Math.min(maxY, this.drag.oy + (e.clientY - this.drag.sy)));
    } else if (this.resize) {
      this.w = Math.max(this.minW, this.resize.ow + (e.clientX - this.resize.sx));
      this.h = Math.max(this.minH, this.resize.oh + (e.clientY - this.resize.sy));
    }
  }

  private onEnd() {
    this.drag = null;
    this.resize = null;
    window.removeEventListener('mousemove', this.moveFn);
    window.removeEventListener('mouseup', this.upFn);
  }

  ngOnDestroy() {
    window.removeEventListener('mousemove', this.moveFn);
    window.removeEventListener('mouseup', this.upFn);
  }
}
