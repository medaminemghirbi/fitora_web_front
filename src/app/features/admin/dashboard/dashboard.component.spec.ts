import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { AuthService } from "../../../core/auth/auth.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { OnboardingState } from "../../../core/models/onboarding.model";
import { Company } from "../../../core/models/company.model";
import { AuditLogsService } from "../../../core/services/audit-logs.service";
import { DashboardResponse, DashboardService } from "../../../core/services/dashboard.service";
import { OnboardingService } from "../../../core/services/onboarding.service";
import { ReportsService } from "../../../core/services/reports.service";
import { ToastService } from "../../../core/services/toast.service";
import { DashboardComponent } from "./dashboard.component";

describe("DashboardComponent", () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let dashboardService: jasmine.SpyObj<DashboardService>;
  let auditLogsService: jasmine.SpyObj<AuditLogsService>;
  let reportsService: jasmine.SpyObj<ReportsService>;
  let onboardingService: jasmine.SpyObj<OnboardingService>;
  let configStub: { onboarding: jasmine.Spy };
  let authStub: { currentUser: jasmine.Spy; hasPermission: jasmine.Spy };
  let toast: ToastService;

  const response: DashboardResponse = {
    company: { id: 1, name: "Fitora Fitness Sousse", currency: "TND" } as unknown as Company,
    stats: {
      total_clients: 12,
      active_contracts: 1,
      todays_bookings: 3,
      todays_attendance: 2,
      outstanding_payments: "65",
      todays_schedule: [
        // Started five minutes ago, running for another hour — this is the
        // session "Aujourd'hui" should be offering to check people into.
        {
          id: "1",
          starts_at: new Date(Date.now() - 5 * 60_000).toISOString(),
          ends_at: new Date(Date.now() + 55 * 60_000).toISOString(),
          activity_name: "EMS",
          activity_emoji: "⚡",
          coach_name: "Amine",
          company_name: "Sousse",
          confirmed_count: 1,
          capacity: 1,
          status: "scheduled",
        },
      ],
      attention: [
        { key: "expiring", count: 2, amount: null, detail: null },
        { key: "unpaid", count: 1, amount: 130, detail: null },
        { key: "expired", count: 0, amount: null, detail: null },
        { key: "sessions_without_coach", count: 0, amount: null, detail: null },
      ],
      contracts_expiring: [],
      recent_payments: [],
      revenue_by_month: [],
      recent_clients: [],
    },
  };

  function build(onboarding: OnboardingState | null = null, auditLogsError = false): void {
    TestBed.resetTestingModule();
    dashboardService = jasmine.createSpyObj("DashboardService", ["get"]);
    dashboardService.get.and.returnValue(of(response));
    auditLogsService = jasmine.createSpyObj("AuditLogsService", ["list"]);
    auditLogsService.list.and.returnValue(
      auditLogsError ? throwError(() => new Error("nope")) : of({ audit_logs: [], meta: { page: 1, per_page: 5, total: 0, total_pages: 0 } })
    );
    reportsService = jasmine.createSpyObj("ReportsService", ["exportCompany"]);
    onboardingService = jasmine.createSpyObj("OnboardingService", ["dismiss", "state"]);
    onboardingService.state.and.returnValue(onboarding);
    configStub = { onboarding: jasmine.createSpy().and.returnValue(onboarding) };
    authStub = { currentUser: jasmine.createSpy().and.returnValue({ first_name: "Yassine", role: "admin" }), hasPermission: jasmine.createSpy().and.returnValue(true) };

    TestBed.configureTestingModule({
      imports: [DashboardComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DashboardService, useValue: dashboardService },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ReportsService, useValue: reportsService },
        { provide: OnboardingService, useValue: onboardingService },
        { provide: AuthService, useValue: authStub },
        { provide: ConfigurationService, useValue: configStub },
      ],
    });

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it("fetches dashboard stats on init", () => {
    expect(dashboardService.get).toHaveBeenCalled();
    expect(component.data()?.stats.todays_bookings).toBe(3);
  });

  it("sets the error flag when loading dashboard stats fails", () => {
    dashboardService.get.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  it("stops audit-log loading even when it fails", () => {
    build(null, true);
    expect(component.auditLogsLoading()).toBe(false);
  });

  it("shows one figure card per number, and the money one only with the money", () => {
    expect(fixture.nativeElement.querySelectorAll(".dash-kpi").length).toBe(5);

    const current = component.data()!;
    component.data.set({ ...current, stats: { ...current.stats, outstanding_payments: null } });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll(".dash-kpi").length).toBe(4);
  });

  it("renders today's schedule rows", () => {
    expect(fixture.nativeElement.querySelectorAll(".dash-day li").length).toBe(1);
  });

  // What asks for a decision comes before what only describes a situation.
  // The figures became cards again, but below the block that needs acting on
  // — which is the part of the old ordering that mattered.
  it("leads with what needs attention, then the figures, then the day", () => {
    const order = [...fixture.nativeElement.querySelectorAll(".dash-attn, .dash-kpis, .dash-day")].map(
      (el: Element) => el.className.split(" ")[0]
    );

    expect(order).toEqual(["dash-attn", "dash-kpis", "dash-day"]);
  });

  it("names the coach on a session that has one", () => {
    expect(fixture.nativeElement.textContent).toContain("Amine");
  });

  it("says a session is short a coach in words, not only by colour", () => {
    const current = component.data()!;
    component.data.set({
      ...current,
      stats: {
        ...current.stats,
        todays_schedule: [{ ...current.stats.todays_schedule[0], coach_name: null }],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("dashboard.no_coach");
  });

  it("shows the detail line under an attention row when the payload carries one", () => {
    const current = component.data()!;
    component.data.set({
      ...current,
      stats: {
        ...current.stats,
        attention: [{ key: "unpaid", count: 4, amount: 340, detail: { kind: "oldest_days", count: 23 } }],
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".dash-attn-detail")).toBeTruthy();
  });

  describe("fillPct", () => {
    it("computes the confirmed/capacity percentage", () => {
      expect(component.fillPct({ confirmed_count: 3, capacity: 4 } as never)).toBe(75);
    });

    it("caps at 100 for an overbooked session", () => {
      expect(component.fillPct({ confirmed_count: 5, capacity: 4 } as never)).toBe(100);
    });

    it("returns 0 for a zero-capacity session instead of dividing by zero", () => {
      expect(component.fillPct({ confirmed_count: 0, capacity: 0 } as never)).toBe(0);
    });
  });

  describe("the attention block", () => {
    it("drops the empty rows and points each survivor at the screen that resolves it", () => {
      expect(component.attention().map((r) => r.key)).toEqual(["expiring", "unpaid"]);

      const expiring = component.attention()[0];
      expect(expiring.route).toBe("/admin/contracts");
      expect(expiring.query).toEqual({ status: "expiring" });

      const unpaid = component.attention()[1];
      expect(unpaid.query).toEqual({ payment: "unpaid" });
      expect(unpaid.amount).toBe(130);
    });

    it("is not 'all clear' while there is still work", () => {
      expect(component.allClear()).toBe(false);
    });
  });

  describe("utility bar toggles", () => {
    it("export and activity panels start collapsed", () => {
      expect(component.exportOpen()).toBe(false);
      expect(component.activityOpen()).toBe(false);
    });
  });

  const incomplete: OnboardingState = {
    step: "company", complete: false, dismissed: false, done_count: 0, total: 4,
    steps: [{ key: "company", skippable: false, state: "current", count: null }],
  };

  it("showSetupCard is false with no setup state", () => {
    expect(component.showSetupCard).toBe(false);
  });

  it("showSetupCard is true for an incomplete, non-dismissed setup as admin", () => {
    build(incomplete);
    expect(component.showSetupCard).toBe(true);
  });

  it("showSetupCard is false once complete or dismissed", () => {
    build({ ...incomplete, complete: true });
    expect(component.showSetupCard).toBe(false);
  });

  it("showSetupCard is false for a non-admin even with incomplete setup", () => {
    build(incomplete);
    authStub.currentUser.and.returnValue({ first_name: "K", role: "staff" });
    expect(component.showSetupCard).toBe(false);
  });

  it("dismissSetup delegates to the onboarding service", () => {
    onboardingService.dismiss.and.returnValue(of({ onboarding: {} as OnboardingState }));
    component.dismissSetup();
    expect(onboardingService.dismiss).toHaveBeenCalled();
  });

  it("knows which of today's sessions are already over", () => {
    const clock = jasmine.clock();
    clock.install();
    try {
      clock.mockDate(new Date(2026, 0, 1, 14));

      const done = { ends_at: new Date(2026, 0, 1, 13).toISOString() } as never;
      const running = { ends_at: new Date(2026, 0, 1, 15).toISOString() } as never;

      expect(component.hasEnded(done)).toBe(true);
      expect(component.hasEnded(running)).toBe(false);
    } finally {
      clock.uninstall();
    }
  });

  describe("exportReport", () => {
    it("does nothing when the period is blank", () => {
      component.exportPeriodType.set("month");
      component.exportMonth.set("");
      component.exportReport();
      expect(reportsService.exportCompany).not.toHaveBeenCalled();
    });

    it("exports the monthly report", () => {
      reportsService.exportCompany.and.returnValue(of(new Blob(["x"])));
      component.exportPeriodType.set("month");
      component.exportMonth.set("2026-01");
      component.exportReport();
      expect(reportsService.exportCompany).toHaveBeenCalledWith("month", "2026-01");
      expect(component.exporting()).toBe(false);
    });

    it("exports the yearly report", () => {
      reportsService.exportCompany.and.returnValue(of(new Blob(["x"])));
      component.exportPeriodType.set("year");
      component.exportYear.set(2026);
      component.exportReport();
      expect(reportsService.exportCompany).toHaveBeenCalledWith("year", "2026");
    });

    it("shows an error toast on failure", () => {
      reportsService.exportCompany.and.returnValue(throwError(() => new Error("nope")));
      component.exportPeriodType.set("month");
      component.exportMonth.set("2026-01");
      component.exportReport();
      expect(component.exporting()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("a login that may not read what the gym earns", () => {
    it("keeps the volumes and shows no figure in money", () => {
      const withoutRevenue: DashboardResponse = {
        ...response,
        stats: {
          ...response.stats,
          outstanding_payments: null,
          recent_payments: [],
          revenue_by_month: [],
          attention: [{ key: "unpaid", count: 3, amount: null, detail: null }],
        },
      };
      dashboardService.get.and.returnValue(of(withoutRevenue));
      component.load();
      fixture.detectChanges();

      const text: string = fixture.nativeElement.textContent;
      expect(text).not.toContain("TND");
      // The work is still theirs to chase; only the amount is withheld.
      expect(component.attention()[0].count).toBe(3);
      expect(component.attention()[0].amount).toBeNull();
    });
  });

  describe("the session happening now", () => {
    it("is the one the clock is inside", () => {
      expect(component.currentSession()?.id).toBe("1");
    });

    it("is nobody once it has finished", () => {
      dashboardService.get.and.returnValue(
        of({
          ...response,
          stats: {
            ...response.stats,
            todays_schedule: [
              {
                ...response.stats.todays_schedule[0],
                starts_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
                ends_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
              },
            ],
          },
        })
      );
      component.load();
      expect(component.currentSession()).toBeNull();
    });

    it("never offers a cancelled session, even mid-slot", () => {
      dashboardService.get.and.returnValue(
        of({
          ...response,
          stats: {
            ...response.stats,
            todays_schedule: [{ ...response.stats.todays_schedule[0], status: "cancelled" }],
          },
        })
      );
      component.load();
      expect(component.currentSession()).toBeNull();
    });

    it("reloads the counts once check-in is closed, since attendance moved", () => {
      component.openCheckin("1");
      expect(component.checkinSessionId()).toBe("1");

      dashboardService.get.calls.reset();
      component.closeCheckin();

      expect(component.checkinSessionId()).toBeNull();
      expect(dashboardService.get).toHaveBeenCalled();
    });
  });

  describe("what an audit entry says", () => {
    it("uses the translation when there is one", () => {
      // TranslateModule is stubbed in these specs, so instant() echoes the
      // key — which is exactly the "no translation" case below. Here the
      // point is that it asks for the right key.
      const translate = TestBed.inject(TranslateService);
      spyOn(translate, "instant").and.returnValue("Paiement encaissé");

      expect(component.auditLabel("payment.recorded")).toBe("Paiement encaissé");
      expect(translate.instant).toHaveBeenCalledWith("audit.payment.recorded");
    });

    it("never prints the key at the reader when an action has no label yet", () => {
      const translate = TestBed.inject(TranslateService);
      spyOn(translate, "instant").and.callFake((key: string) => key);

      const label = component.auditLabel("subscription.invoice_issued");

      expect(label).not.toContain("audit.");
      expect(label).toBe("Subscription invoice issued");
    });
  });
});
