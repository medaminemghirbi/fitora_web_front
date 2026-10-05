import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { SuperadminSubscriptionPricingService, SubscriptionPricing } from "../../../core/services/superadmin-subscription-pricing.service";
import { PlanKey } from "../../../core/models/subscription.model";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";

interface PlanRow {
  plan: PlanKey;
  monthlyUnits: number;
  accountsCount: number;
}

/**
 * What Fitora's two plans cost, per currency, and the annual discount.
 * Starter is the whole product; Pro adds the member app and every update.
 * Each is priced per admin account, however many salles it covers.
 */
@Component({
  selector: "app-superadmin-pricing",
  standalone: true,
  imports: [FormsModule, TranslateModule, SpinnerComponent, ErrorStateComponent, MoneyPipe],
  templateUrl: "./pricing.component.html",
  styleUrl: "./pricing.component.scss",
})
export class SuperadminPricingComponent implements OnInit {
  private readonly service = inject(SuperadminSubscriptionPricingService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);
  readonly pricing = signal<SubscriptionPricing | null>(null);

  readonly currency = signal("TND");
  readonly discount = signal(0);
  readonly plans = signal<PlanRow[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.get(this.currency()).subscribe({
      next: (res) => {
        this.apply(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  onCurrencyChange(code: string): void {
    this.currency.set(code);
    this.load();
  }

  /** The year as the admin will see it, before anything is saved. */
  annualUnits(row: PlanRow): number {
    return Math.round(row.monthlyUnits * 12 * (100 - this.discount())) / 100;
  }

  get dirty(): boolean {
    const p = this.pricing();
    if (!p) return false;
    if (this.discount() !== p.annual_discount_percent) return true;

    return this.plans().some((row) => {
      const original = p.plans.find((t) => t.plan === row.plan);
      return !original || Math.round(row.monthlyUnits * 100) !== original.monthly_cents;
    });
  }

  save(): void {
    this.saving.set(true);

    const plans: Partial<Record<PlanKey, number>> = {};
    this.plans().forEach((row) => {
      plans[row.plan] = Math.max(0, Math.round(row.monthlyUnits * 100));
    });

    this.service.update({ currency: this.currency(), plans, annual_discount_percent: this.discount() }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.apply(res);
        this.toast.success(this.translate.instant("common.save"));
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  private apply(res: SubscriptionPricing): void {
    this.pricing.set(res);
    this.currency.set(res.currency);
    this.discount.set(res.annual_discount_percent);
    this.plans.set(
      res.plans.map((p) => ({ plan: p.plan, monthlyUnits: p.monthly_cents / 100, accountsCount: p.accounts_count }))
    );
  }
}
