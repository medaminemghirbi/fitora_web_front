import { Component, Input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

/** The Pro tools a Starter account sees locked. */
export type ProFeature = "salles" | "roles" | "branding" | "data_exchange" | "mobile_app";

/**
 * Stands in for a Pro tool on a Starter account: what the tool does, that
 * it comes with Pro, and the way to the subscription page. The backend
 * refuses the same tools (`pro_required`), so this is the explanation, not
 * the lock itself.
 *
 * `compact` fits it inside a form (the branding section keeps its contract
 * part, which every plan has).
 */
@Component({
  selector: "app-pro-lock",
  standalone: true,
  imports: [RouterLink, TranslateModule],
  template: `
    <div class="pro-lock" [class.is-compact]="compact" role="note">
      <span class="pro-lock-ic" aria-hidden="true"><i class="bi bi-lock-fill"></i></span>
      <div class="pro-lock-body">
        <span class="pro-lock-chip"><i class="bi bi-lock-fill"></i> Pro</span>
        <h2 class="pro-lock-title">{{ "pro_lock." + feature + "_title" | translate }}</h2>
        <p class="pro-lock-text">{{ "pro_lock." + feature + "_body" | translate }}</p>
        <a routerLink="/admin/subscription" class="btn btn-primary pro-lock-cta">
          <i class="bi bi-stars" aria-hidden="true"></i> {{ "pro_lock.cta" | translate }}
        </a>
      </div>
    </div>
  `,
  styles: [
    `
      .pro-lock {
        display: flex;
        gap: 1.25rem;
        align-items: flex-start;
        padding: 2rem;
        border-radius: var(--radius-xl);
        border: 1px dashed var(--color-primary-border);
        background: var(--color-primary-soft);
      }

      .pro-lock.is-compact {
        padding: 1.25rem;
        margin-bottom: 1.5rem;
      }

      .pro-lock-ic {
        width: 48px;
        height: 48px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border-radius: 14px;
        background: var(--color-primary);
        color: var(--color-on-primary);
        font-size: 1.25rem;
      }

      .pro-lock-chip {
        display: inline-block;
        padding: 2px 10px;
        border-radius: var(--radius-pill);
        background: var(--color-text);
        color: var(--color-surface);
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: 0.04em;
      }

      .pro-lock-title {
        margin: 0.5rem 0 0.375rem;
        font-size: 1.125rem;
        font-weight: 800;
        color: var(--color-text);
      }

      .pro-lock-text {
        margin: 0 0 1rem;
        max-width: 560px;
        color: var(--color-text-secondary);
        font-size: 0.9375rem;
      }

      .pro-lock-cta {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }

      @media (max-width: 575.98px) {
        .pro-lock {
          flex-direction: column;
          padding: 1.25rem;
        }
      }
    `,
  ],
})
export class ProLockComponent {
  @Input({ required: true }) feature!: ProFeature;
  @Input() compact = false;
}
