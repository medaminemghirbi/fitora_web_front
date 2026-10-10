import { Component, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { BillingPeriod, PlanKey } from "../../core/models/subscription.model";
import { LocaleService, Locale, LOCALES } from "../../core/services/locale.service";
import { ThemeService } from "../../core/services/theme.service";

interface TodayClass {
  time: string;
  name: string;
  coach: string;
  room: string;
  booked: number;
  capacity: number;
  waitlist: number;
}

interface Plan {
  key: PlanKey;
  monthly: number;
  items: string[];
}

/**
 * What each plan costs per month, in dinars, and the annual discount — kept
 * in step BY HAND with the superadmin's TND prices (SubscriptionPrice +
 * PlatformSetting.annual_discount_percent). There is no public pricing
 * endpoint; when one exists, read it instead.
 */
const MONTHLY_DT: Record<PlanKey, number> = { starter: 165, pro: 249 };
const ANNUAL_DISCOUNT_PERCENT = 10;

/** Which of the three days' slots are already taken, for the booking mock. */
const TAKEN_BY_DAY = [["12:30", "19:00"], ["09:00", "18:00"], ["07:30", "20:00"]];

/**
 * Public landing page — "Fitora × Shoot" (2026-10-09): Shoot's bold layout
 * (pill buttons, heavy sans headlines, a ticker, product mocks built from
 * divs, a dark closing block with a form) on Fitora's aubergine, with one
 * Fraunces italic phrase per headline and lime as the highlight.
 *
 * Sections: nav → hero with today's classes → ticker of modules → before /
 * with Fitora → six features → three steps as mock screens → every screen
 * (bento) → the two plans → questions → closing form → footer. Everything
 * is visible at rest; the mocks' data is illustrative.
 *
 * Nav and footer are inline rather than shared components: nothing else
 * uses them (the account screens have their own frame, AuthProShell).
 */
@Component({
  selector: "app-landing",
  standalone: true,
  imports: [RouterLink, TranslateModule, ReactiveFormsModule],
  templateUrl: "./landing.component.html",
  styleUrl: "./landing.component.scss",
})
export class LandingComponent {
  readonly theme = inject(ThemeService);
  readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly langMenuOpen = signal(false);
  readonly mobileOpen = signal(false);
  readonly locales = LOCALES;
  readonly year = signal(new Date().getFullYear());

  /** The switch shows codes, not names — three names do not fit a pill. */
  readonly shortLabel: Record<Locale, string> = { fr: "FR", en: "EN", ar: "ع" };

  private readonly intlCode = computed(() => (this.locale.locale() === "ar" ? "ar-TN" : this.locale.locale()));

  /** Today's date in the page's language — the hero card is "today". */
  readonly todayLabel = computed(() => {
    const code = this.intlCode();
    const label = new Intl.DateTimeFormat(code, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    return label.charAt(0).toLocaleUpperCase(code) + label.slice(1);
  });

  /** One studio's day, for the hero card. Illustrative. */
  readonly todayClasses: TodayClass[] = [
    { time: "07:30", name: "EMS", coach: "Amine", room: "Cabine 1", booked: 1, capacity: 1, waitlist: 0 },
    { time: "09:00", name: "Pilates Reformer", coach: "Sarah", room: "Studio", booked: 6, capacity: 6, waitlist: 2 },
    { time: "12:30", name: "Coaching privé", coach: "Yassine", room: "Studio 2", booked: 1, capacity: 1, waitlist: 0 },
    { time: "18:30", name: "Yoga Vinyasa", coach: "Lina", room: "Studio", booked: 9, capacity: 14, waitlist: 0 },
  ];

  readonly heroPoints = ["landing.hero_point_1", "landing.hero_point_2", "landing.hero_point_3"];

  /** The ticker under the hero — every module, named once. */
  readonly band = [
    "landing.band_1",
    "landing.band_2",
    "landing.band_3",
    "landing.band_4",
    "landing.band_5",
    "landing.band_6",
    "landing.band_7",
    "landing.band_8",
  ];

  readonly pains = ["landing.pain_1", "landing.pain_2", "landing.pain_3", "landing.pain_4"];

  /** Each answers the pain at the same position. */
  readonly wins = [
    { icon: "bi-bell", n: 1 },
    { icon: "bi-receipt", n: 2 },
    { icon: "bi-grid-1x2", n: 3 },
    { icon: "bi-lock", n: 4 },
  ];

  /**
   * The six features, in the order a studio meets them with a new client.
   * `pro`: needs the member app, which only a paid Pro plan opens (locked during the trial).
   */
  readonly features = [
    { icon: "bi-calendar3", title: "landing.f_planning_t", text: "landing.f_planning_d" },
    { icon: "bi-clock", title: "landing.f_slots_t", text: "landing.f_slots_d", pro: true },
    { icon: "bi-ticket-perforated", title: "landing.f_memberships_t", text: "landing.f_memberships_d" },
    { icon: "bi-person-plus", title: "landing.f_trial_t", text: "landing.f_trial_d" },
    { icon: "bi-bell", title: "landing.f_reminders_t", text: "landing.f_reminders_d" },
    { icon: "bi-heart-pulse", title: "landing.f_member_t", text: "landing.f_member_d" },
  ];

  // ---- Step 2's booking mock: the next three days, a slot to pick ----
  readonly selectedDay = signal(0);
  readonly selectedSlot = signal("18:00");
  readonly slotTimes = ["07:30", "09:00", "12:30", "18:00", "19:00", "20:00"];

  /** Tomorrow and the two days after, in the page's language. */
  readonly bookingDays = computed(() => {
    const code = this.intlCode();
    const weekday = new Intl.DateTimeFormat(code, { weekday: "short" });
    const date = new Intl.DateTimeFormat(code, { day: "numeric", month: "short" });
    return [1, 2, 3].map((offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return { weekday: weekday.format(d), date: date.format(d) };
    });
  });

  isTaken(time: string): boolean {
    return TAKEN_BY_DAY[this.selectedDay()].includes(time);
  }

  pickDay(i: number): void {
    this.selectedDay.set(i);
  }

  pickSlot(time: string): void {
    if (!this.isTaken(time)) this.selectedSlot.set(time);
  }

  // ---- Pricing ----
  readonly billing = signal<BillingPeriod>("monthly");
  readonly annualDiscount = ANNUAL_DISCOUNT_PERCENT;

  readonly plans: Plan[] = [
    {
      key: "starter",
      monthly: MONTHLY_DT.starter,
      items: ["landing.plan_item_all", "landing.plan_item_one_salle", "landing.plan_item_system_roles"],
    },
    {
      key: "pro",
      monthly: MONTHLY_DT.pro,
      // Kept in step with Subscription#pro_features? on the backend.
      items: [
        "landing.plan_item_everything_starter",
        "landing.plan_item_multi_salle",
        "landing.plan_item_member_app",
        "landing.plan_item_custom_roles",
        "landing.plan_item_branding",
        "landing.plan_item_import",
        "landing.plan_item_print",
        "landing.plan_item_updates",
      ],
    },
  ];

  // Both plans. Importing members is a Pro tool, so it is not listed here.
  readonly included = [
    "landing.pricing_item_1",
    "landing.pricing_item_4",
    "landing.pricing_item_5",
    "landing.pricing_item_6",
    "landing.pricing_item_7",
  ];

  /** The plan's price for the chosen period: per month, or the year's total after the discount. */
  priceOf(plan: Plan): string {
    const amount = this.billing() === "monthly" ? plan.monthly : (plan.monthly * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100;
    const decimals = Number.isInteger(amount) ? 0 : 2;
    return new Intl.NumberFormat(this.intlCode(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
  }

  /** Which of the landing.faq_q_N / faq_a_N pairs to show, in order. */
  readonly faqs = [1, 4, 9, 3, 8, 7];

  // ---- FAQ accordion — one open panel at a time ----
  readonly openFaq = signal<number | null>(1);

  toggleFaq(i: number): void {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }

  // ---- The closing form: hands what it has over to /inscription ----
  readonly startForm = this.fb.nonNullable.group({
    first_name: [""],
    email: ["", Validators.email],
  });

  start(): void {
    if (this.startForm.invalid) {
      this.startForm.markAllAsTouched();
      return;
    }
    const { first_name, email } = this.startForm.getRawValue();
    const queryParams: Record<string, string> = {};
    if (first_name.trim()) queryParams["first_name"] = first_name.trim();
    if (email.trim()) queryParams["email"] = email.trim();
    this.router.navigate(["/inscription"], { queryParams });
  }

  fill(c: TodayClass): number {
    return Math.min(100, Math.round((c.booked / c.capacity) * 100));
  }

  /** A group that has run out of places. A one-to-one slot is booked, not "full". */
  isFull(c: TodayClass): boolean {
    return c.capacity > 1 && c.booked >= c.capacity;
  }

  setLocale(code: Locale): void {
    this.locale.setLocale(code);
    this.langMenuOpen.set(false);
  }
}
