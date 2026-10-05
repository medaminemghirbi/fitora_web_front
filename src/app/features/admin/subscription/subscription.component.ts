import { Component, computed, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { SubscriptionInfo, SubscriptionService } from "../../../core/services/subscription.service";
import { PlanKey } from "../../../core/models/subscription.model";
import { SupportTicketsService } from "../../../core/services/support-tickets.service";
import { AuthService } from "../../../core/auth/auth.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { isValidPhone } from "../../../shared/utils/phone";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";
import { ModalComponent } from "../../../shared/components/modal.component";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";

/** One plan as the picker shows it — priced for the chosen period. */
export interface PlanCard {
  key: PlanKey;
  nameKey: string;
  price: number;
  current: boolean;
}

/** Where access stands, as the pill on the plan card says it. */
export type AccessState = "open" | "due" | "closed" | "trial";

/** Something every plan carries: a module, or the moderators. */
export interface IncludedItem {
  key: string;
  labelKey: string;
}

/** What only Pro (and the trial) carries, and whether this account has it. */
export interface ProFeature {
  key: "member_app" | "multi_salle" | "updates";
  icon: string;
  held: boolean;
}

const DAY_MS = 86_400_000;

/** A `YYYY-MM-DD` date as local midnight. */
function parseDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The admin's view of their account's Fitora access: what they are on, how
 * far into the period they are, what the plan carries, and — on the side —
 * changing plan.
 *
 * Nothing is bought here. The admin asks for a plan, settles with Fitora
 * directly, and Fitora confirms.
 *
 * The invoice table and the bank details were removed on request; the
 * invoices are read only to place today inside the period it falls in.
 */
@Component({
  selector: "app-subscription",
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    TranslateModule,
    MoneyPipe,
    ModalComponent,
    SpinnerComponent,
    SkeletonComponent,
    ErrorStateComponent,
  ],
  templateUrl: "./subscription.component.html",
  styleUrl: "./subscription.component.scss",
})
export class SubscriptionComponent {
  private readonly service = inject(SubscriptionService);
  private readonly tickets = inject(SupportTicketsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);
  private readonly config = inject(ConfigurationService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly info = signal<SubscriptionInfo | null>(null);

  readonly sub = computed(() => this.info()?.subscription ?? null);
  readonly accessOpen = computed(() => this.sub()?.active ?? false);
  readonly paidThrough = computed(() => this.sub()?.paid_through ?? null);
  readonly currentPeriodPaid = computed(() => this.sub()?.current_period_paid ?? false);
  readonly daysBeforeLock = computed(() => this.sub()?.days_before_lock ?? null);
  readonly arrears = computed(() => (this.info()?.arrears_cents ?? 0) / 100);
  readonly currency = computed(() => this.info()?.currency ?? "TND");
  /** Pro, or a free trial: members can sign in to their app. */
  readonly memberApp = computed(() => this.sub()?.member_app ?? false);
  /** Pro, or a free trial: the account may open another salle. */
  readonly multiSalle = computed(() => this.sub()?.multi_salle ?? false);

  // ---- the free trial -----------------------------------------------------
  // A new account has paid nothing and chosen nothing. It is shown as what
  // it is, until a first payment makes a plan current.
  readonly onTrial = computed(() => this.sub()?.trial ?? false);
  readonly trialDaysLeft = computed(() => this.sub()?.trial_days_left ?? 0);
  /** Free days still ahead and the door still open. */
  readonly trialRunning = computed(() => this.onTrial() && this.accessOpen() && this.trialDaysLeft() > 0);
  readonly trialOver = computed(() => this.onTrial() && !this.trialRunning());

  readonly accessState = computed<AccessState>(() => {
    if (this.trialRunning()) return "trial";
    if (this.trialOver() || !this.accessOpen()) return "closed";
    return this.currentPeriodPaid() ? "open" : "due";
  });

  readonly accessLabel = computed(() => {
    if (this.trialRunning()) return "subscription.trial_running";
    if (this.trialOver()) return "subscription.tier_trial_over";
    return `subscription.pill_${this.accessState()}`;
  });

  // ---- what the account is on ---------------------------------------------
  readonly currentPlanName = computed(() => {
    if (this.trialRunning()) return "subscription.tier_trial";
    if (this.trialOver()) return "subscription.tier_trial_over";
    return `subscription.plan_${this.sub()?.plan ?? "starter"}`;
  });

  readonly currentPlanTagline = computed(() => {
    if (this.trialRunning()) return "subscription.tier_trial_for";
    if (this.trialOver()) return "subscription.trial_over_sub";
    return `${this.currentPlanName()}_for`;
  });

  /** What the account pays, for the period it is billed on. */
  readonly currentPrice = computed(() => {
    const info = this.info();
    if (!info) return 0;
    return (this.sub()?.billing_period === "yearly" ? info.annual_subscription_cents : info.monthly_subscription_cents) / 100;
  });

  /**
   * The period today falls in, from the invoice that covers it (the trial
   * included), and how far through it we are. Null before any invoice.
   */
  readonly period = computed(() => {
    const invoices = this.info()?.invoices ?? [];
    const today = todayIso();
    const current = invoices.find((i) => i.period_start <= today && today <= i.period_end) ?? invoices[0];
    if (!current) return null;

    const start = parseDay(current.period_start);
    const end = parseDay(current.period_end) + DAY_MS;
    const done = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
    return { start: current.period_start, end: current.period_end, percent: Math.round(done * 100) };
  });

  /** Days until the next period starts: the day after the last one paid. */
  readonly renewsIn = computed(() => {
    const through = this.paidThrough();
    if (!through) return null;
    return Math.round((parseDay(through) - parseDay(todayIso())) / DAY_MS) + 1;
  });

  /** What the account covers: every salle, its team and its members. */
  readonly usage = computed(() => {
    const info = this.info();
    if (!info) return [];

    return [
      { key: "companies", icon: "bi-building", value: String(info.companies_count) },
      { key: "staff", icon: "bi-person-badge", value: String(info.staff_used) },
      { key: "clients", icon: "bi-people", value: String(info.clients_used) },
    ];
  });

  /**
   * What only Pro adds — several salles, the member app, every update —
   * shown whatever the plan, so Starter sees what it is missing. The trial
   * holds all three; updates follow the member app (Pro or trial).
   */
  readonly proFeatures = computed<ProFeature[]>(() => [
    { key: "multi_salle", icon: "bi-buildings", held: this.multiSalle() },
    { key: "member_app", icon: "bi-phone", held: this.memberApp() },
    { key: "updates", icon: "bi-arrow-repeat", held: this.memberApp() },
  ]);

  /** What every plan carries: the modules the backend reports, and the moderators. */
  readonly includedEverywhere = computed<IncludedItem[]>(() => [
    ...(this.info()?.included_modules ?? []).map((key) => ({ key, labelKey: `modules.${key}.name` })),
    { key: "shared_team", labelKey: "subscription.extra_shared_team" },
  ]);

  // ---- changing plan ------------------------------------------------------
  // Starter and Pro, priced in the account's own currency from real
  // SubscriptionPrice rows, so nothing here is invented.
  readonly billingPeriod = signal<"monthly" | "yearly">("monthly");

  readonly plans = computed<PlanCard[]>(() =>
    (this.info()?.plans ?? []).map((plan) => ({
      key: plan.key,
      nameKey: `subscription.plan_${plan.key}`,
      price: (this.billingPeriod() === "yearly" ? plan.annual_cents : plan.monthly_cents) / 100,
      // Nothing is chosen on trial.
      current: !this.onTrial() && plan.key === this.sub()?.plan,
    }))
  );

  /** The plan ticked in the picker. Until the admin picks, the one they are on — Pro on trial, the closest to it. */
  readonly picked = signal<PlanKey | null>(null);
  readonly pickedPlan = computed(() => {
    const plans = this.plans();
    const key = this.picked() ?? plans.find((p) => p.current)?.key ?? "pro";
    return plans.find((p) => p.key === key) ?? plans[0] ?? null;
  });

  /** The picked plan on the period already billed: nothing to ask for. */
  readonly pickIsCurrent = computed(() => {
    const plan = this.pickedPlan();
    if (!plan?.current) return false;
    return (this.sub()?.billing_period ?? this.billingPeriod()) === this.billingPeriod();
  });

  /** Same plan, other period: a request to change how it is billed. */
  readonly pickSwitchesPeriod = computed(() => !!this.pickedPlan()?.current && !this.pickIsCurrent());

  /** Leaving Pro, or the trial, for Starter takes the member app and new salles away. */
  readonly pickLosesPro = computed(() => this.pickedPlan()?.key === "starter" && (this.memberApp() || this.multiSalle()));

  // ---- asking for a plan -------------------------------------------------
  // Payment happens outside the app, so choosing a plan is a conversation,
  // not a transaction. The request rides on the support ticket the admin
  // can already send and read back on /admin/support, rather than a second
  // inbox that would have to be watched separately.
  readonly requestPlan = signal<PlanCard | null>(null);
  readonly requestNote = signal("");
  /**
   * Required: Fitora calls back to set the plan up, since payment happens
   * off-app. The backend refuses a plan request without one too.
   */
  readonly requestPhone = signal("");
  /** Set on the first send attempt, so the field is not red before it is touched. */
  readonly phoneTouched = signal(false);
  readonly phoneValid = computed(() => isValidPhone(this.requestPhone()));
  readonly requesting = signal(false);
  /** Plan + period pairs sent, so the page stops offering what was just asked for. */
  readonly requestedPlans = signal<string[]>([]);

  private requestKey(plan: PlanCard): string {
    return `${plan.key}:${this.billingPeriod()}`;
  }

  openRequest(plan: PlanCard): void {
    this.requestPlan.set(plan);
    this.requestNote.set("");
    // Most admins already gave a number somewhere: theirs first, then the
    // gym's. Still editable — the best number to reach them on may differ.
    this.requestPhone.set(this.auth.currentUser()?.phone ?? this.config.company()?.phone ?? "");
    this.phoneTouched.set(false);
  }

  closeRequest(): void {
    if (this.requesting()) return;
    this.requestPlan.set(null);
  }

  requested(plan: PlanCard): boolean {
    return this.requestedPlans().includes(this.requestKey(plan));
  }

  submitRequest(): void {
    const plan = this.requestPlan();
    if (!plan || this.requesting()) return;

    this.phoneTouched.set(true);
    if (!this.phoneValid()) return;
    const phone = this.requestPhone().trim();

    const planName = this.translate.instant(plan.nameKey);
    const period = this.translate.instant(
      this.billingPeriod() === "yearly" ? "subscription.plan_yearly" : "subscription.plan_monthly"
    );
    const subject = this.translate.instant("subscription.request_subject", { plan: planName, period });
    const body = this.translate.instant("subscription.request_body", { plan: planName, period });
    const note = this.requestNote().trim();

    this.requesting.set(true);
    this.tickets.create(subject, note ? `${body}\n\n${note}` : body, [], { kind: "upgrade", contact_phone: phone }).subscribe({
      next: () => {
        this.requesting.set(false);
        this.requestPlan.set(null);
        this.requestedPlans.update((list) => [...list, this.requestKey(plan)]);
        this.toast.success(this.translate.instant("subscription.request_sent"));
      },
      error: (err) => {
        this.requesting.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.get().subscribe({
      next: (info) => {
        this.info.set(info);
        // Open on the period the account is billed on, so its own plan
        // shows the price actually paid.
        this.billingPeriod.set(info.subscription?.billing_period === "yearly" ? "yearly" : "monthly");
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
