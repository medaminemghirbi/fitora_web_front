import { A11yModule } from "@angular/cdk/a11y";
import { Component, EventEmitter, HostListener, Input, Output } from "@angular/core";

@Component({
  selector: "app-modal",
  standalone: true,
  imports: [A11yModule],
  template: `
    @if (open) {
      <!-- Backdrop: mouse-only dismiss; Escape (see the host listener below) is the keyboard equivalent. -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div class="modal-backdrop-custom" (click)="closed.emit()">
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
        <div class="modal-panel" [class.modal-panel--wide]="size === 'wide'" cdkTrapFocus cdkTrapFocusAutoCapture role="dialog" aria-modal="true"
             [attr.aria-label]="title" (click)="$event.stopPropagation()">
          <div class="modal-panel-header">
            <h3>{{ title }}</h3>
            <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-panel-body">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop-custom {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      z-index: var(--z-modal);
      padding: 3rem 1rem;
      overflow-y: auto;
      animation: fx-fade var(--transition-base);
    }
    .modal-panel {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
      width: 100%;
      max-width: 540px;
      animation: fx-modal-in var(--transition-base);
    }
    /* For content laid out in a grid (the activity catalogue), not a form. */
    .modal-panel--wide { max-width: 860px; }
    .modal-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.1rem 1.25rem 1.1rem 1.5rem;
      border-bottom: 1px solid var(--color-border);
    }
    .modal-panel-header h3 {
      margin: 0;
      font-size: 1.0625rem;
      font-weight: 600;
      color: var(--color-text);
    }
    .modal-panel-body { padding: 1.5rem; }
    @keyframes fx-modal-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `],
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = "";
  @Input() size: "default" | "wide" = "default";
  @Output() closed = new EventEmitter<void>();

  @HostListener("document:keydown.escape")
  onEsc(): void {
    if (this.open) this.closed.emit();
  }
}
