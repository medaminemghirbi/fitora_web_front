import { Component, OnInit, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { COUNTRIES, toCountryCode } from "../../../core/models/countries";
import { browserTimezone, ensureTimezone, timezoneForCountry } from "../../../core/models/timezones";
import { CompanyService } from "../../../core/services/company.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { SearchableSelectComponent, SearchableOption } from "../../../shared/ui/searchable-select.component";

@Component({
  selector: "app-settings-company",
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, SpinnerComponent, SearchableSelectComponent],
  templateUrl: "./settings-company.component.html",
})
export class SettingsCompanyComponent implements OnInit {
  readonly loading = signal(true);
  readonly saving = signal(false);

  // currency + app language are Fitora-superadmin managed (shown read-only below).
  readonly currency = signal("TND");
  readonly currencySymbol = signal("");
  readonly locale = signal("fr");

  readonly countryOptions: SearchableOption[] = COUNTRIES.map((c) => ({ value: c.code, label: c.name, prefix: c.flag }));
  readonly timezoneGroups = signal(ensureTimezone(browserTimezone()));

  readonly form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    description: [""],
    phone: [""],
    email: ["", Validators.email],
    country: [""],
    city: [""],
    address: [""],
    timezone: [browserTimezone(), Validators.required],
  });

  private hydrated = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly companyService: CompanyService,
    private readonly toast: ToastService,
    private readonly translate: TranslateService
  ) {
    // Changing the country after load re-aligns the timezone to that country's
    // main zone (skipped during the initial patchValue).
    this.form.controls.country.valueChanges.subscribe((code) => {
      if (!this.hydrated) return;
      const tz = timezoneForCountry(code);
      if (tz) {
        this.timezoneGroups.set(ensureTimezone(tz));
        this.form.controls.timezone.setValue(tz);
      }
    });
  }

  ngOnInit(): void {
    this.companyService.get().subscribe({
      next: (res) => {
        const org = res.company;
        if (!org) {
          this.loading.set(false);
          return;
        }
        const tz = org.timezone || browserTimezone();
        this.timezoneGroups.set(ensureTimezone(tz));
        this.form.patchValue({
          name: org.name,
          description: org.description ?? "",
          phone: org.phone ?? "",
          email: org.email ?? "",
          country: toCountryCode(org.country),
          city: org.city ?? "",
          address: org.address ?? "",
          timezone: tz,
        });
        this.currency.set(org.currency);
        this.currencySymbol.set(org.currency_symbol);
        this.locale.set(org.locale);
        this.hydrated = true;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.companyService.update(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.translate.instant("common.save"));
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
