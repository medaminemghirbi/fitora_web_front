import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { SuperadminMetricsService, PlatformMetrics } from "../../../core/services/superadmin-metrics.service";
import { SuperadminOverviewComponent } from "./superadmin-overview.component";

function metrics(overrides: Partial<PlatformMetrics> = {}): PlatformMetrics {
  return {
    companies: { total: 10, open: 8, locked: 2, new_this_month: 4, new_last_month: 2, plans: { starter: 6, pro: 3 } },
    members: { total: 250, new_this_month: 30 },
    activity: { sessions_last_30_days: 400, bookings_last_30_days: 1200, companies_with_activity: 5 },
    money: { invoiced_this_month_cents: 120_000, arrears_cents: 33_000, currency: "TND" },
    recent_companies: [],
    ...overrides,
  };
}

describe("SuperadminOverviewComponent", () => {
  let fixture: ComponentFixture<SuperadminOverviewComponent>;
  let component: SuperadminOverviewComponent;
  let service: jasmine.SpyObj<SuperadminMetricsService>;

  async function build(response: PlatformMetrics | null, fail = false) {
    service = jasmine.createSpyObj<SuperadminMetricsService>("SuperadminMetricsService", ["get"]);
    service.get.and.returnValue(fail ? throwError(() => new Error("down")) : (of(response) as never));

    await TestBed.configureTestingModule({
      imports: [SuperadminOverviewComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: SuperadminMetricsService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperadminOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it("loads the platform metrics", async () => {
    await build(metrics());

    expect(component.metrics()?.companies.total).toBe(10);
    expect(component.loading()).toBe(false);
  });

  describe("the signup trend", () => {
    it("is the change against last month", async () => {
      await build(metrics());

      expect(component.signupTrend()).toBe(100);
    });

    it("reports a fall as a negative", async () => {
      await build(metrics({ companies: { total: 10, open: 8, locked: 2, new_this_month: 1, new_last_month: 4, plans: { starter: 6, pro: 3 } } }));

      expect(component.signupTrend()).toBe(-75);
    });

    it("is null in a first month rather than inventing +100%", async () => {
      await build(metrics({ companies: { total: 4, open: 4, locked: 0, new_this_month: 4, new_last_month: 0, plans: { starter: 4, pro: 0 } } }));

      expect(component.signupTrend()).toBeNull();
    });
  });

  describe("the share actually using it", () => {
    it("is the proportion of gyms that ran a session", async () => {
      await build(metrics());

      expect(component.activeShare()).toBe(50);
    });

    it("is null with no gyms at all, rather than dividing by zero", async () => {
      await build(
        metrics({
          companies: { total: 0, open: 0, locked: 0, new_this_month: 0, new_last_month: 0, plans: { starter: 0, pro: 0 } },
          activity: { sessions_last_30_days: 0, bookings_last_30_days: 0, companies_with_activity: 0 },
        })
      );

      expect(component.activeShare()).toBeNull();
    });
  });

  it("shows money as an amount, never as bare cents", async () => {
    await build(metrics());

    // Asserts the cents-to-units conversion, not the host's thousands
    // separator — that varies by locale and is not what this method decides.
    expect(component.money(120_000).replace(/\D/g, "")).toBe("1200");
    expect(component.money(33_050)).toContain("330");
    expect(component.money(0)).toBe("0");
  });

  it("surfaces a failure instead of an empty dashboard", async () => {
    await build(null, true);

    expect(component.error()).toBeTruthy();
    expect(component.loading()).toBe(false);
  });
});
