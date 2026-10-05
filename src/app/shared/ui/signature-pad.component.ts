import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild, inject, signal } from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";

interface Point {
  x: number;
  y: number;
}

/** Ink of a pen on paper — the pad is always white, whatever the app theme. */
const INK = "#1d1533";
const LINE_WIDTH = 2.6;
/** Room kept around the strokes when the signature is cropped out. */
const TRIM_PADDING = 12;

/**
 * A signature drawn by hand — with a mouse, a finger or a stylus — handed
 * out as a PNG File: transparent background, cropped tight to the ink, so it
 * sits on a printed contract like a real signature rather than in a box.
 *
 * Emits on every finished stroke (`signed`), and `null` once cleared.
 * Drawing is pointer-only by nature; the page offering it should also offer
 * an image upload, which is what a keyboard user can do instead.
 */
@Component({
  selector: "app-signature-pad",
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="sp-paper" [class.is-empty]="empty()">
      <canvas #canvas class="sp-canvas" role="img" [attr.aria-label]="'signature_pad.label' | translate"></canvas>
      @if (empty()) {
        <span class="sp-hint" aria-hidden="true"><i class="bi bi-pen"></i> {{ "signature_pad.hint" | translate }}</span>
      }
      <span class="sp-baseline" aria-hidden="true"></span>
    </div>
    <div class="sp-actions">
      <button type="button" class="btn btn-link btn-sm px-0" [disabled]="empty()" (click)="clear()">
        <i class="bi bi-eraser" aria-hidden="true"></i> {{ "signature_pad.clear" | translate }}
      </button>
    </div>
  `,
  styles: [
    `
      :host { display: block; }

      .sp-paper {
        position: relative;
        height: var(--sp-height, 170px);
        border: 1.5px solid var(--color-border-strong);
        border-radius: var(--radius-md);
        /* Paper white in both themes: the ink has to read as it will print. */
        background: #fff;
        overflow: hidden;
        cursor: crosshair;
      }

      .sp-paper:focus-within { box-shadow: var(--shadow-focus); }

      .sp-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        /* No page scroll or zoom while a finger is signing. */
        touch-action: none;
      }

      .sp-hint {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: #8c84a3;
        font-size: var(--font-size-sm);
        pointer-events: none;
      }

      .sp-baseline {
        position: absolute;
        left: 8%;
        right: 8%;
        bottom: 28%;
        border-bottom: 1px dashed #d9d2e6;
        pointer-events: none;
      }

      .sp-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 0.25rem;
      }
    `,
  ],
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  /** Name of the File handed out. */
  @Input() filename = "signature.png";
  @Output() readonly signed = new EventEmitter<File | null>();

  @ViewChild("canvas", { static: true }) private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly empty = signal(true);

  private readonly zone = inject(NgZone);
  private context!: CanvasRenderingContext2D;
  private drawing = false;
  private last: Point | null = null;
  private lastMid: Point | null = null;
  private bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  private ratio = 1;
  private readonly listeners: [string, EventListener][] = [];

  ngAfterViewInit(): void {
    this.fit();

    // Pointer moves fire dozens of times a second; none of them changes
    // anything Angular renders, so they stay out of change detection.
    this.zone.runOutsideAngular(() => {
      this.listen("pointerdown", (e) => this.start(e as PointerEvent));
      this.listen("pointermove", (e) => this.move(e as PointerEvent));
      this.listen("pointerup", (e) => this.end(e as PointerEvent));
      this.listen("pointercancel", (e) => this.end(e as PointerEvent));
    });
  }

  ngOnDestroy(): void {
    const canvas = this.canvasRef.nativeElement;
    this.listeners.forEach(([type, handler]) => canvas.removeEventListener(type, handler));
  }

  clear(): void {
    const canvas = this.canvasRef.nativeElement;
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, canvas.width, canvas.height);
    this.context.restore();
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    this.empty.set(true);
    this.signed.emit(null);
  }

  /**
   * Sizes the drawing surface to the box it is shown in, at the screen's
   * pixel density. Resizing a canvas wipes it, so this only runs while it
   * is empty — on init, and again before a first stroke in case the window
   * changed width in between.
   */
  private fit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width * this.ratio), 1);
    const height = Math.max(Math.round(rect.height * this.ratio), 1);
    if (this.context && canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;
    this.context = canvas.getContext("2d")!;
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.context.strokeStyle = INK;
    this.context.fillStyle = INK;
    this.context.lineWidth = LINE_WIDTH;
    this.context.lineCap = "round";
    this.context.lineJoin = "round";
  }

  private listen(type: string, handler: EventListener): void {
    this.canvasRef.nativeElement.addEventListener(type, handler);
    this.listeners.push([type, handler]);
  }

  private point(event: PointerEvent): Point {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private start(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    if (this.empty()) this.fit();
    this.canvasRef.nativeElement.setPointerCapture?.(event.pointerId);
    this.drawing = true;
    const p = this.point(event);
    this.last = p;
    this.lastMid = p;
    this.track(p);
    // A tap is a dot, as it would be with a pen.
    this.context.beginPath();
    this.context.arc(p.x, p.y, LINE_WIDTH / 2, 0, Math.PI * 2);
    this.context.fill();
  }

  private move(event: PointerEvent): void {
    if (!this.drawing || !this.last || !this.lastMid) return;
    event.preventDefault();
    const p = this.point(event);
    // Curve through the midpoints, so a fast stroke is smooth rather than a
    // run of straight segments.
    const mid = { x: (this.last.x + p.x) / 2, y: (this.last.y + p.y) / 2 };
    this.context.beginPath();
    this.context.moveTo(this.lastMid.x, this.lastMid.y);
    this.context.quadraticCurveTo(this.last.x, this.last.y, mid.x, mid.y);
    this.context.stroke();
    this.last = p;
    this.lastMid = mid;
    this.track(p);
  }

  private end(event: PointerEvent): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.canvasRef.nativeElement.releasePointerCapture?.(event.pointerId);
    this.last = null;
    this.lastMid = null;
    this.zone.run(() => {
      this.empty.set(false);
      this.export();
    });
  }

  private track(p: Point): void {
    this.bounds.minX = Math.min(this.bounds.minX, p.x);
    this.bounds.minY = Math.min(this.bounds.minY, p.y);
    this.bounds.maxX = Math.max(this.bounds.maxX, p.x);
    this.bounds.maxY = Math.max(this.bounds.maxY, p.y);
  }

  /** The ink alone, cropped to its strokes, as a transparent PNG. */
  private export(): void {
    const source = this.canvasRef.nativeElement;
    const pad = TRIM_PADDING;
    const x = Math.max(Math.floor((this.bounds.minX - pad) * this.ratio), 0);
    const y = Math.max(Math.floor((this.bounds.minY - pad) * this.ratio), 0);
    const width = Math.min(Math.ceil((this.bounds.maxX - this.bounds.minX + pad * 2) * this.ratio), source.width - x);
    const height = Math.min(Math.ceil((this.bounds.maxY - this.bounds.minY + pad * 2) * this.ratio), source.height - y);

    const crop = document.createElement("canvas");
    crop.width = Math.max(width, 1);
    crop.height = Math.max(height, 1);
    crop.getContext("2d")!.drawImage(source, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    crop.toBlob((blob) => {
      if (blob) this.zone.run(() => this.signed.emit(new File([blob], this.filename, { type: "image/png" })));
    }, "image/png");
  }
}
