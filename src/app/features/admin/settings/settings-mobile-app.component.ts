import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { ConfirmService } from "../../../core/services/confirm.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { AppKeyAudience, MobileAppKeys, MobileAppService } from "../../../core/services/mobile-app.service";
import { ToastService } from "../../../core/services/toast.service";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";

interface KeyCard {
  audience: AppKeyAudience;
  icon: string;
  titleKey: string;
  hintKey: string;
  key: string;
  qr: SafeHtml;
}

/**
 * Settings → Application mobile (a Pro tool): the two keys that turn the
 * generic Fitora app into this salle's app — the member code for members,
 * the coach key for the team — each with its QR code, a copy button and a
 * way to replace it (the old key stops pairing at once).
 *
 * Keys are shown in capitals for reading; the app lowercases what is typed.
 */
@Component({
  selector: "app-settings-mobile-app",
  standalone: true,
  imports: [TranslateModule, SkeletonComponent, ErrorStateComponent],
  template: `
    @if (loading()) {
      <app-skeleton variant="cards" [count]="2" />
    } @else if (error()) {
      <div class="app-card"><div class="app-card-body"><app-error-state (retry)="load()" /></div></div>
    } @else {
      <div class="ma-grid">
        @for (card of cards(); track card.audience) {
          <article class="app-card ma-card">
            <div class="app-card-body">
              <header class="ma-head">
                <span class="ma-ic"><i class="bi" [class]="card.icon" aria-hidden="true"></i></span>
                <div>
                  <h2>{{ card.titleKey | translate }}</h2>
                  <p>{{ card.hintKey | translate }}</p>
                </div>
              </header>
              <div class="ma-body">
                <!-- Drawn by our own backend (rqrcode), so it is trusted SVG. -->
                <div class="ma-qr" [innerHTML]="card.qr" role="img" [attr.aria-label]="'settings.mobile_qr_label' | translate"></div>
                <div class="ma-key-col">
                  <span class="ma-key-label">{{ "settings.mobile_key_label" | translate }}</span>
                  <code class="ma-key" dir="ltr">{{ card.key.toUpperCase() }}</code>
                  <div class="ma-actions">
                    <button type="button" class="btn btn-primary btn-sm" (click)="copy(card)">
                      <i class="bi bi-clipboard" aria-hidden="true"></i> {{ "settings.mobile_copy" | translate }}
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="regenerating() === card.audience" (click)="regenerate(card)">
                      <i class="bi bi-arrow-repeat" aria-hidden="true"></i> {{ "settings.mobile_regenerate" | translate }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        }
      </div>
      <p class="ma-note"><i class="bi bi-info-circle" aria-hidden="true"></i> {{ "settings.mobile_note" | translate }}</p>
    }
  `,
  styles: [
    `
      .ma-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
      }

      @media (max-width: 991.98px) {
        .ma-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .ma-head {
        display: flex;
        gap: 0.875rem;
        align-items: flex-start;
        margin-bottom: 1.25rem;

        h2 {
          margin: 0;
          font-size: 1.0625rem;
          font-weight: 800;
        }

        p {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--color-text-secondary);
        }
      }

      .ma-ic {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: var(--color-primary-soft);
        color: var(--color-primary);
        font-size: 1.125rem;
      }

      .ma-body {
        display: flex;
        gap: 1.25rem;
        align-items: center;
        flex-wrap: wrap;
      }

      .ma-qr {
        width: 136px;
        height: 136px;
        flex-shrink: 0;
        padding: 8px;
        border: 1px solid var(--color-border);
        border-radius: 14px;
        background: #fff;

        ::ng-deep svg {
          display: block;
          width: 100%;
          height: 100%;
        }
      }

      .ma-key-col {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        min-width: 0;
      }

      .ma-key-label {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-secondary);
      }

      .ma-key {
        font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
        font-size: 1.375rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        color: var(--color-text);
        word-break: break-all;
      }

      .ma-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
        }
      }

      .ma-note {
        display: flex;
        gap: 0.5rem;
        margin: var(--space-4) 0 0;
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
      }
    `,
  ],
})
export class SettingsMobileAppComponent implements OnInit {
  private readonly service = inject(MobileAppService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly confirm = inject(ConfirmService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly keys = signal<MobileAppKeys | null>(null);
  readonly regenerating = signal<AppKeyAudience | null>(null);

  readonly cards = computed<KeyCard[]>(() => {
    const k = this.keys();
    if (!k) return [];
    return [
      {
        audience: "member",
        icon: "bi-people",
        titleKey: "settings.mobile_member_title",
        hintKey: "settings.mobile_member_hint",
        key: k.member_code,
        qr: this.sanitizer.bypassSecurityTrustHtml(k.member_qr_svg),
      },
      {
        audience: "coach",
        icon: "bi-person-badge",
        titleKey: "settings.mobile_coach_title",
        hintKey: "settings.mobile_coach_hint",
        key: k.coach_key,
        qr: this.sanitizer.bypassSecurityTrustHtml(k.coach_qr_svg),
      },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.keys().subscribe({
      next: (keys) => {
        this.keys.set(keys);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  copy(card: KeyCard): void {
    navigator.clipboard?.writeText(card.key.toUpperCase()).then(
      () => this.toast.success(this.translate.instant("settings.mobile_copied")),
      () => this.toast.error(this.translate.instant("common.error_generic"))
    );
  }

  async regenerate(card: KeyCard): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("settings.mobile_regenerate_title"),
      body: this.translate.instant("settings.mobile_regenerate_body"),
      danger: true,
    });
    if (!confirmed) return;

    this.regenerating.set(card.audience);
    this.service.regenerate(card.audience).subscribe({
      next: (keys) => {
        this.keys.set(keys);
        this.regenerating.set(null);
        this.toast.success(this.translate.instant("settings.mobile_regenerated"));
      },
      error: (err) => {
        this.regenerating.set(null);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
