import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { AuthService } from "../../../core/auth/auth.service";
import { ActivityTemplate, CustomActivity } from "../../../core/models/activity-template.model";
import { ActivityTemplatesService } from "../../../core/services/activity-templates.service";
import { COUNTRIES } from "../../../core/models/countries";
import { CURRENCIES } from "../../../core/models/currency";
import { ensureTimezone, guessLocation, timezoneForCountry } from "../../../core/models/timezones";
import { CompanyService } from "../../../core/services/company.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { SearchableSelectComponent, SearchableOption } from "../../../shared/ui/searchable-select.component";
import { ActivityPickerComponent } from "../../../shared/ui/activity-picker.component";
import { WizardStepsComponent } from "../../../shared/ui/wizard-steps.component";

const PREP_MS = 5000;
const PREP_STEPS = ["company_setup.prep_step_1", "company_setup.prep_step_2", "company_setup.prep_step_3", "company_setup.prep_step_4"];

@Component({
  selector: "app-company-setup",
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, SpinnerComponent, SearchableSelectComponent, ActivityPickerComponent, WizardStepsComponent],
  templateUrl: "./company-setup.component.html",
  styleUrls: ["../../auth/auth.component.scss", "./company-setup.component.scss"],
})
export class CompanySetupComponent implements OnInit, OnDestroy {
  private readonly activityTemplates = inject(ActivityTemplatesService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  // Full-screen "we're setting up your account" moment after a successful
  // create — held for at least PREP_MS so the animation reads.
  readonly preparing = signal(false);
  readonly prepStep = signal(0);
  readonly prepSteps = PREP_STEPS;
  private prepTimer?: ReturnType<typeof setInterval>;

  // Two steps: who the salle is, then what it teaches — picked from the
  // catalogue so it opens with its activities instead of an empty form.
  readonly step = signal<0 | 1>(0);
  readonly templates = signal<ActivityTemplate[]>([]);
  readonly templatesLoading = signal(true);
  readonly templatesFailed = signal(false);
  readonly selectedTemplates = signal<string[]>([]);
  readonly customActivities = signal<CustomActivity[]>([]);
  readonly pickedCount = computed(() => this.selectedTemplates().length + this.customActivities().length);

  private readonly detected = guessLocation();

  readonly currencies = CURRENCIES;
  readonly countryOptions: SearchableOption[] = COUNTRIES.map((c) => ({ value: c.code, label: c.name, prefix: c.flag }));
  readonly timezoneGroups = ensureTimezone(this.detected.timezone);

  readonly form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    description: [""],
    phone: [""],
    email: ["", Validators.email],
    country: [this.detected.country],
    city: [""],
    address: [""],
    timezone: [this.detected.timezone, Validators.required],
    currency: ["TND", Validators.required],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly companyService: CompanyService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly translate: TranslateService
  ) {
    // Picking a country moves the timezone to that country's main zone — the
    // user can still fine-tune it afterwards.
    this.form.controls.country.valueChanges.subscribe((code) => {
      const tz = timezoneForCountry(code);
      if (tz) this.form.controls.timezone.setValue(tz);
    });
  }

  ngOnInit(): void {
    // Fetched while the first step is being filled, so the grid is there
    // the moment it is needed. If it fails the salle still opens — its
    // activities can be added from the catalogue page afterwards.
    this.activityTemplates.list().subscribe({
      next: (res) => {
        this.templates.set(res.activity_templates);
        this.templatesLoading.set(false);
      },
      error: () => {
        this.templatesFailed.set(true);
        this.templatesLoading.set(false);
      },
    });
  }

  /** Step 1 → step 2, once the salle's details hold. */
  next(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.step.set(1);
  }

  back(): void {
    this.step.set(0);
  }

  ngOnDestroy(): void {
    if (this.prepTimer) clearInterval(this.prepTimer);
  }

  /** Opens the salle — with what was picked, or with nothing (`skip`). */
  submit(skip = false): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.step.set(0);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.startPreparing();
    const startedAt = Date.now();

    const activities = skip
      ? {}
      : { activity_template_ids: this.selectedTemplates(), custom_activities: this.customActivities() };

    this.companyService.create(this.form.getRawValue(), activities).subscribe({
      next: () => {
        this.auth.refreshCurrentUser().subscribe({
          next: () => this.finish(startedAt),
          error: () => this.finish(startedAt),
        });
      },
      error: (err) => {
        this.stopPreparing();
        this.saving.set(false);
        this.error.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  private startPreparing(): void {
    this.preparing.set(true);
    this.prepStep.set(0);
    const per = PREP_MS / PREP_STEPS.length;
    this.prepTimer = setInterval(() => {
      this.prepStep.update((s) => Math.min(s + 1, PREP_STEPS.length - 1));
    }, per);
  }

  private stopPreparing(): void {
    if (this.prepTimer) clearInterval(this.prepTimer);
    this.prepTimer = undefined;
    this.preparing.set(false);
  }

  private finish(startedAt: number): void {
    const wait = Math.max(0, PREP_MS - (Date.now() - startedAt));
    setTimeout(() => {
      this.stopPreparing();
      this.saving.set(false);
      // A brand-new admin always starts on the "Premiers pas" guide; the
      // guide itself bounces to the dashboard once setup is done/skipped.
      this.router.navigateByUrl("/admin/getting-started");
    }, wait);
  }
}
