import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { DatePipe, LowerCasePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { SuperadminCompany, SuperadminCurrencyOption } from "../../../core/models/superadmin-company.model";
import { Invoice, PLAN_KEYS, PlanKey } from "../../../core/models/subscription.model";
import { SuperadminCompaniesService } from "../../../core/services/superadmin-companies.service";
import { AuthService } from "../../../core/auth/auth.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { LedgerCell, ledgerFor, ledgerYears as yearsFrom } from "../../../shared/utils/payment-ledger";

@Component({
  selector: "app-superadmin-company-detail",
  standalone: true,
  imports: [FormsModule, DatePipe, LowerCasePipe, RouterLink, TranslateModule, MoneyPipe, SpinnerComponent, ErrorStateComponent, StatusBadgeComponent],
  templateUrl: "./company-detail.component.html",
  styleUrl: "./company-detail.component.scss",
})
export class SuperadminCompanyDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(SuperadminCompaniesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly company = signal<SuperadminCompany | null>(null);
  readonly invoices = signal<Invoice[]>([]);

  readonly billingPeriod = signal<string>("monthly");
  readonly savingSub = signal(false);
  readonly savingPlan = signal(false);
  readonly savingInvoice = signal(false);

  readonly currencyOptions = signal<SuperadminCurrencyOption[]>([]);
  readonly localeOptions = signal<string[]>([]);
  readonly currency = signal<string>("TND");
  readonly appLocale = signal<string>("fr");
  readonly savingSettings = signal(false);

  readonly impersonating = signal(false);
  readonly ledgerYear = signal(new Date().getFullYear());

  /**
   * The page answers two questions, and they do not belong together: is this
   * gym paying, and what is this gym. The banner above stays out of both —
   * something that needs deciding must not sit behind a tab.
   */
  readonly tabs = ["billing", "gym"] as const;
  readonly activeTab = signal<(typeof this.tabs)[number]>("billing");

  setTab(tab: (typeof this.tabs)[number]): void {
    this.activeTab.set(tab);
  }

  private id!: string;

  // ---- the plan ------------------------------------------------------------
  // Starter or Pro, named as the admin sees them on their own subscription
  // page. It is the ACCOUNT's: every salle the admin runs shares it.
  readonly planOptions = PLAN_KEYS;

  readonly plan = computed<PlanKey>(() => this.company()?.plan ?? "starter");

  /** Every salle one sale opens — this one, and the admin's others. */
  readonly accountCompanies = computed(() => this.company()?.account_companies ?? []);
  readonly adminGyms = computed(() => this.company()?.admin.companies_count ?? 0);
  readonly memberApp = computed(() => this.company()?.subscription?.member_app ?? false);

  readonly accessOpen = computed(() => this.company()?.subscription?.active ?? false);
  readonly lockReason = computed(() => this.company()?.subscription?.lock_reason ?? null);
  readonly paidThrough = computed(() => this.company()?.subscription?.paid_through ?? null);
  readonly currentPeriodPaid = computed(() => this.company()?.subscription?.current_period_paid ?? false);
  readonly daysBeforeLock = computed(() => this.company()?.subscription?.days_before_lock ?? null);
  readonly arrears = computed(() => (this.company()?.arrears_cents ?? 0) / 100);

  // Nothing paid yet: the period on record is the free one. The formula
  // shown during it is only what the first payment will buy.
  readonly onTrial = computed(() => this.company()?.subscription?.trial ?? false);
  readonly trialDaysLeft = computed(() => this.company()?.subscription?.trial_days_left ?? 0);

  /** What "payment received" will issue, so the button says it before the click. */
  readonly nextInvoice = computed(() => this.company()?.next_invoice ?? null);

  /**
   * The one thing this page is for, when there is one. A gym that is open
   * and paid up gets no banner at all.
   */
  readonly attention = computed<"suspended" | "unpaid" | "trial_over" | "never" | "due" | null>(() => {
    if (!this.company()) return null;
    if (!this.accessOpen()) {
      if (this.lockReason() !== "unpaid") return "suspended";
      // Closed because the free days ran out, not because a payment lapsed.
      return this.company()?.subscription?.trial ? "trial_over" : "unpaid";
    }
    if (this.currentPeriodPaid()) return null;
    // Nothing was ever invoiced, so there is no period to count down from.
    return this.paidThrough() === null ? "never" : "due";
  });

  // ---- the ledger: every month of a year, and its invoice ------------------
  // Years come from the invoices, not from a window around today: a gym that
  // has been a client for four years has invoices a fixed window cannot reach.
  readonly ledgerYears = computed(() => yearsFrom(this.invoices()));

  /** The gym's first day, or its first invoice if an import predates it. */
  private readonly since = computed<Date | null>(() => {
    const created = this.company()?.created_at;
    const starts = this.invoices().map((i) => new Date(i.period_start).getTime());
    if (created) starts.push(new Date(created).getTime());
    return starts.length ? new Date(Math.min(...starts)) : null;
  });

  readonly ledger = computed<LedgerCell[]>(() => ledgerFor(this.ledgerYear(), this.invoices(), new Date(), this.since()));

  readonly ledgerPaidCount = computed(() => this.ledger().filter((c) => c.state === "paid").length);
  // Each invoice once: a yearly one paints twelve cells but was paid once.
  readonly ledgerCollected = computed(() => {
    const paid = new Set(this.ledger().flatMap((c) => (c.state === "paid" && c.invoice ? [c.invoice] : [])));
    return [...paid].reduce((sum, i) => sum + i.amount, 0);
  });

  ngOnInit(): void {
    // A param subscription, not a snapshot: the account's other salles link
    // to this same route, and Angular reuses the component between them.
    this.route.paramMap.subscribe((params) => {
      this.id = params.get("id")!;
      this.activeTab.set("billing");
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.get(this.id).subscribe({
      next: (res) => {
        this.hydrate(res.company);
        this.currencyOptions.set(res.currency_options);
        this.localeOptions.set(res.locale_options);
        this.loading.set(false);
        this.loadInvoices();
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadInvoices(): void {
    this.service.invoices(this.id).subscribe({
      next: (res) => this.invoices.set(res.invoices),
      error: () => this.invoices.set([]),
    });
  }

  private hydrate(company: SuperadminCompany): void {
    this.company.set(company);
    this.billingPeriod.set(company.subscription?.billing_period ?? "monthly");
    this.currency.set(company.currency);
    this.appLocale.set(company.locale);
  }

  // ---- the money arriving --------------------------------------------------
  issueInvoice(): void {
    if (this.savingInvoice()) return;

    this.savingInvoice.set(true);
    this.service.issueInvoice(this.id).subscribe({
      next: (res) => {
        this.savingInvoice.set(false);
        this.hydrate(res.company);
        this.loadInvoices();
        this.toast.success(this.translate.instant("superadmin.invoice_issued", { number: res.invoice.number }));
      },
      error: (err) => {
        this.savingInvoice.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  async voidInvoice(invoice: Invoice): Promise<void> {
    if (this.savingInvoice()) return;

    const confirmed = await this.confirm.ask({
      title: this.translate.instant("superadmin.void_invoice_title"),
      body: this.translate.instant("superadmin.void_invoice_body", { number: invoice.number }),
      danger: true,
    });
    if (!confirmed) return;

    this.savingInvoice.set(true);
    this.service.voidInvoice(this.id, invoice.id).subscribe({
      next: (res) => {
        this.savingInvoice.set(false);
        this.hydrate(res.company);
        this.loadInvoices();
      },
      error: (err) => {
        this.savingInvoice.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // ---- access, and what an invoice covers ---------------------------------
  toggleAccess(): void {
    this.updateSubscription({ active: !this.accessOpen() }, this.accessOpen() ? "superadmin.access_suspended" : "superadmin.access_restored");
  }

  /**
   * Moves the account between Starter and Pro. It is the account's plan, not
   * this salle's, so every salle the admin runs moves with it — the card
   * says so. Access and the free trial are left as they are: only an
   * invoice ends a trial.
   */
  changePlan(plan: PlanKey): void {
    if (this.savingPlan() || plan === this.plan()) return;

    this.savingPlan.set(true);
    this.service.updateSubscription(this.id, { plan }).subscribe({
      next: (res) => {
        this.savingPlan.set(false);
        this.hydrate(res.company);
        this.toast.success(this.translate.instant("superadmin.plan_changed"));
      },
      error: (err) => {
        this.savingPlan.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  changeBillingPeriod(period: string): void {
    this.billingPeriod.set(period);
    this.updateSubscription({ billing_period: period }, "common.saved");
  }

  private updateSubscription(payload: Parameters<SuperadminCompaniesService["updateSubscription"]>[1], successKey: string): void {
    if (this.savingSub()) return;

    this.savingSub.set(true);
    this.service.updateSubscription(this.id, payload).subscribe({
      next: (res) => {
        this.savingSub.set(false);
        this.hydrate(res.company);
        this.toast.success(this.translate.instant(successKey));
      },
      error: (err) => {
        this.savingSub.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  saveSettings(): void {
    this.savingSettings.set(true);
    this.service.updateSettings(this.id, { currency: this.currency(), locale: this.appLocale() }).subscribe({
      next: (res) => {
        this.savingSettings.set(false);
        this.hydrate(res.company);
        this.toast.success(this.translate.instant("common.saved"));
      },
      error: (err) => {
        this.savingSettings.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  readonly settingsDirty = computed(() => {
    const c = this.company();
    if (!c) return false;
    return this.currency() !== c.currency || this.appLocale() !== c.locale;
  });

  impersonate(): void {
    this.impersonating.set(true);
    const name = this.company()?.name ?? "";
    this.service.impersonate(this.id).subscribe({
      next: (res) => {
        this.impersonating.set(false);
        this.auth.startImpersonation(res, name);
      },
      error: (err) => {
        this.impersonating.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
