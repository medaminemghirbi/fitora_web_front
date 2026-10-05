import { Component, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { CompanySettings } from "../../../core/models/company.model";
import { CompanyService } from "../../../core/services/company.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { ToastService } from "../../../core/services/toast.service";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";

/**
 * How this gym books.
 *
 * The engine has read these rules since the settings column existed —
 * Bookings::Create and Bookings::Cancel enforce them — but nothing could
 * write them, so every gym ran on the defaults. This is the screen that
 * makes "a boxing club and an EMS studio are the same codebase" true from
 * the outside as well as the inside.
 *
 * Each rule says what it does in the gym's own terms, and the ones that only
 * matter when something else is on are hidden until it is.
 */
@Component({
  selector: "app-settings-booking",
  standalone: true,
  imports: [FormsModule, TranslateModule, ErrorStateComponent, SkeletonComponent],
  templateUrl: "./settings-booking.component.html",
  styleUrl: "./settings-booking.component.scss",
})
export class SettingsBookingComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly settings = signal<CompanySettings | null>(null);

  /** How far ahead a member may book. Offered as choices, not a free number. */
  readonly horizons = [7, 14, 30, 60, 90];

  /** Cancellation windows a gym would actually pick. */
  readonly windows = [0, 2, 6, 12, 24, 48];

  /** When a member hears about their session. 0 = no reminder. */
  readonly reminderWindows = [0, 2, 12, 24, 48];

  constructor(
    private readonly companyService: CompanyService,
    private readonly configuration: ConfigurationService,
    private readonly toast: ToastService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.companyService.get().subscribe({
      next: (res) => {
        this.settings.set(res.company.settings);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        this.loading.set(false);
      },
    });
  }

  /**
   * Writes one field and saves.
   *
   * A toggle that needs a separate Save is a toggle people leave unsaved, so
   * each change goes straight out. The patch carries only the section that
   * changed — the backend merges, and anything it does not declare is
   * dropped rather than stored.
   */
  setFeature(key: keyof CompanySettings["features"], value: boolean): void {
    const current = this.settings();
    if (!current) return;

    this.settings.set({ ...current, features: { ...current.features, [key]: value } });
    this.save({ features: { [key]: value } });
  }

  setRule<K extends keyof CompanySettings["booking"]>(key: K, value: CompanySettings["booking"][K]): void {
    const current = this.settings();
    if (!current) return;

    this.settings.set({ ...current, booking: { ...current.booking, [key]: value } });
    this.save({ booking: { [key]: value } });
  }

  private save(patch: Record<string, unknown>): void {
    this.saving.set(true);

    this.companyService.update({ settings: patch } as never).subscribe({
      next: (res) => {
        // Take the server's version back: it clamps a value out of range and
        // drops anything it does not recognise, so what it returns is what
        // is actually stored.
        this.settings.set(res.company.settings);
        this.saving.set(false);
        this.toast.success(this.translate.instant("common.saved"));
        // A feature switch changes what the menus and the catalogue offer
        // (rooms, packs), which they read from the bootstrap payload.
        if ("features" in patch) this.configuration.load().subscribe({ error: () => undefined });
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        // Whatever the optimistic write guessed, the server is the truth.
        this.load();
      },
    });
  }
}
