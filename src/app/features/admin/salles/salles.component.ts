import { Component, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { CompanyNetwork, CompanyService, NetworkCompany, NetworkModerator } from "../../../core/services/company.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { ensureTimezone } from "../../../core/models/timezones";
import { PageHeaderComponent } from "../../../shared/ui/page-header.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { AvatarComponent } from "../../../shared/components/avatar.component";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";

/**
 * "Mes salles": every salle the admin runs, on one account and one plan.
 *
 * Three things happen here and nowhere else: opening another salle,
 * switching the session onto one, and posting moderators to them. A
 * moderator is created once, on the team page of any salle, and posted from
 * here to as many salles as they work in; coaches stay with the salle whose
 * timetable they teach.
 */
@Component({
  selector: "app-salles",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
    PageHeaderComponent,
    SkeletonComponent,
    ErrorStateComponent,
    ModalComponent,
    AvatarComponent,
    EmptyStateComponent,
  ],
  templateUrl: "./salles.component.html",
  styleUrl: "./salles.component.scss",
})
export class SallesComponent {
  private readonly companies = inject(CompanyService);
  private readonly config = inject(ConfigurationService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly network = signal<CompanyNetwork | null>(null);

  readonly salles = computed(() => this.network()?.companies ?? []);
  readonly moderators = computed(() => this.network()?.moderators ?? []);
  private readonly moderatorsById = computed(() => new Map(this.moderators().map((m) => [m.id, m])));
  private readonly sallesById = computed(() => new Map(this.salles().map((s) => [s.id, s])));

  /** The account's plan, for the line that says one plan covers them all. */
  readonly planKey = computed(() => this.config.subscription()?.plan ?? "starter");
  /**
   * Whether the account may open another salle: Pro, or the trial. True
   * until known, so the button is never locked on a guess — the backend
   * refuses anyway.
   */
  readonly multiSalle = computed(() => this.config.subscription()?.multi_salle ?? true);
  readonly planNoteKey = computed(() => {
    if (this.config.subscription()?.trial) return "salles.plan_note_trial";
    return this.multiSalle() ? "salles.plan_note" : "salles.plan_note_starter";
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.companies.network().subscribe({
      next: (network) => {
        this.network.set(network);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  moderatorsOf(salle: NetworkCompany): NetworkModerator[] {
    const byId = this.moderatorsById();
    return salle.moderator_ids.flatMap((id) => byId.get(id) ?? []);
  }

  salleName(id: string): string {
    return this.sallesById().get(id)?.name ?? "";
  }

  // ---- switching ----------------------------------------------------------
  // A full reload rather than a router navigation: every page's data belongs
  // to the salle that was active when it fetched, and the shell's own
  // bootstrap (roles, features, branding) is the salle's too.
  readonly switching = signal<string | null>(null);

  switchTo(salle: NetworkCompany): void {
    if (salle.active || this.switching()) return;

    this.switching.set(salle.id);
    this.companies.switchTo(salle.id).subscribe({
      next: () => this.reload("/admin/dashboard"),
      error: (err) => {
        this.switching.set(null);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // Its own method so tests have a seam: browsers do not allow stubbing
  // window.location itself.
  protected reload(path: string): void {
    window.location.assign(path);
  }

  // ---- posting moderators -------------------------------------------------
  readonly assigning = signal<NetworkCompany | null>(null);
  readonly picked = signal<ReadonlySet<string>>(new Set());
  readonly savingModerators = signal(false);

  openAssign(salle: NetworkCompany): void {
    this.assigning.set(salle);
    this.picked.set(new Set(salle.moderator_ids));
  }

  closeAssign(): void {
    if (this.savingModerators()) return;
    this.assigning.set(null);
  }

  toggle(id: string): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.picked.set(next);
  }

  /**
   * A moderator whose only salle is this one cannot be taken off it here:
   * they would be left working nowhere. Deactivating them is the team
   * page's job. The backend refuses it too.
   */
  isOnlySalle(moderator: NetworkModerator, salle: NetworkCompany): boolean {
    return moderator.company_ids.length === 1 && moderator.company_ids[0] === salle.id;
  }

  readonly assignDirty = computed(() => {
    const salle = this.assigning();
    if (!salle) return false;
    const picked = this.picked();
    return picked.size !== salle.moderator_ids.length || salle.moderator_ids.some((id) => !picked.has(id));
  });

  saveModerators(): void {
    const salle = this.assigning();
    if (!salle || this.savingModerators() || !this.assignDirty()) return;

    this.savingModerators.set(true);
    this.companies.setModerators(salle.id, [...this.picked()]).subscribe({
      next: (network) => {
        this.network.set(network);
        this.savingModerators.set(false);
        this.assigning.set(null);
        this.toast.success(this.translate.instant("salles.moderators_saved", { name: salle.name }));
      },
      error: (err) => {
        this.savingModerators.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // ---- opening a salle ----------------------------------------------------
  readonly creating = signal(false);
  readonly savingSalle = signal(false);
  readonly createError = signal<string | null>(null);

  /** A new salle starts in the active one's zone — most networks are one country. */
  private readonly defaultTimezone = this.config.company()?.timezone ?? "Africa/Tunis";
  readonly timezoneGroups = ensureTimezone(this.defaultTimezone);

  readonly form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    city: [""],
    phone: [""],
    timezone: [this.defaultTimezone, Validators.required],
  });

  openCreate(): void {
    if (!this.multiSalle()) return;
    this.form.reset({ name: "", city: "", phone: "", timezone: this.defaultTimezone });
    this.createError.set(null);
    this.creating.set(true);
  }

  closeCreate(): void {
    if (this.savingSalle()) return;
    this.creating.set(false);
  }

  submitCreate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.savingSalle()) return;

    this.savingSalle.set(true);
    this.createError.set(null);
    // The account is billed in its first salle's currency; a new salle
    // starts in the active one's so the two read alike.
    const currency = this.config.company()?.currency ?? "TND";
    this.companies.create({ ...this.form.getRawValue(), currency }).subscribe({
      // The new salle is the active one now, and it is empty: its setup
      // flow is where it starts.
      next: () => this.reload("/admin/onboarding"),
      error: (err) => {
        this.savingSalle.set(false);
        // The plan changed since the page loaded: say it in the gym's words.
        this.createError.set(
          err?.error?.error === "multi_salle_not_included"
            ? this.translate.instant("salles.needs_pro_refused")
            : extractErrorMessage(err, this.translate.instant("common.error_generic"))
        );
      },
    });
  }
}
