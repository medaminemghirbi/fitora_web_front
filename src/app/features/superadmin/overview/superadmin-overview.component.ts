import { Component, OnInit, computed, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { SuperadminMetricsService, PlatformMetrics } from "../../../core/services/superadmin-metrics.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";

/**
 * How Fitora itself is doing.
 *
 * The superadmin console opened on a list of companies, which answers "who are
 * they" and not "how is the business". This answers the second, in four
 * numbers that have a decision behind them: are gyms still signing up, are
 * they still using it, is anyone locked out, and is anyone not paying.
 *
 * Aggregates only. No gym's members, bookings or payments are reachable from
 * here — the way in to a gym's own records is impersonation, which is audited.
 */
@Component({
  selector: "app-superadmin-overview",
  standalone: true,
  imports: [DatePipe, RouterLink, TranslateModule, ErrorStateComponent, SkeletonComponent],
  templateUrl: "./superadmin-overview.component.html",
  styleUrl: "./superadmin-overview.component.scss",
})
export class SuperadminOverviewComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly metrics = signal<PlatformMetrics | null>(null);

  /**
   * Signups this month against last. Null when there is nothing to compare
   * against — a first month has no trend, and inventing one ("+100%") would
   * be worse than saying nothing.
   */
  readonly signupTrend = computed(() => {
    const companies = this.metrics()?.companies;
    if (!companies || companies.new_last_month === 0) return null;

    const change = ((companies.new_this_month - companies.new_last_month) / companies.new_last_month) * 100;
    return Math.round(change);
  });

  /**
   * The share of gyms that actually ran a session in the last 30 days. The
   * one number that says whether this is being used or merely bought.
   */
  readonly activeShare = computed(() => {
    const m = this.metrics();
    if (!m || m.companies.total === 0) return null;

    return Math.round((m.activity.companies_with_activity / m.companies.total) * 100);
  });

  constructor(
    private readonly service: SuperadminMetricsService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.service.get().subscribe({
      next: (metrics) => {
        this.metrics.set(metrics);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        this.loading.set(false);
      },
    });
  }

  /** Cents to a readable amount. Money is never shown as a bare integer. */
  money(cents: number): string {
    return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}
