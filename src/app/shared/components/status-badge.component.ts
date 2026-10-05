import { Component, Input, computed, signal } from "@angular/core";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

/**
 * One vocabulary for the whole app, in four colours:
 *
 *   success — in order, nothing to do
 *   warning — worth watching, will need doing
 *   danger  — needs doing now
 *   neutral — no longer applies
 *
 * `info` is for a state that is neither good nor bad and asks nothing of
 * anyone (a finished session, a refund that went through).
 *
 * Every status string in the app resolves through here, so a member's
 * "expiré" and a payment's "impayé" read the same red wherever they appear.
 */
const TONE_BY_STATUS: Record<string, BadgeTone> = {
  scheduled: "success",
  confirmed: "success",
  active: "success",
  available: "success",
  paid: "success",
  present: "success",
  completed: "info",
  no_show: "warning",
  late: "warning",
  full: "warning",
  pending: "warning",
  // Running out is worth watching; having run out needs doing.
  expiring: "warning",
  expiring_soon: "warning",
  expired: "danger",
  cancelled: "neutral",
  failed: "danger",
  absent: "danger",
  unpaid: "danger",
  refunded: "info",
  trial: "info",
  // On hold — not a problem, not running either.
  paused: "info",
  drop_in: "info",
  inactive: "neutral",
};

@Component({
  selector: "app-status-badge",
  standalone: true,
  template: `<span class="status-badge status-badge--{{ tone() }}"><ng-content></ng-content></span>`,
  styles: [`
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .status-badge--success { background: var(--color-success-soft); color: var(--color-success); }
    .status-badge--warning { background: var(--color-warning-soft); color: var(--color-warning); }
    .status-badge--danger { background: var(--color-danger-soft); color: var(--color-danger); }
    .status-badge--info { background: var(--color-info-soft); color: var(--color-info); }
    .status-badge--neutral { background: var(--color-border); color: var(--color-text-secondary); }
  `],
})
export class StatusBadgeComponent {
  private readonly statusSignal = signal<string>("");

  @Input() set status(value: string) {
    this.statusSignal.set(value);
  }

  readonly tone = computed<BadgeTone>(() => TONE_BY_STATUS[this.statusSignal()] ?? "neutral");
}
