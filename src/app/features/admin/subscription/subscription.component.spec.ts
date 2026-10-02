import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { SubscriptionInfo, SubscriptionService } from "../../../core/services/subscription.service";
import { SupportTicketsService } from "../../../core/services/support-tickets.service";
import { SupportTicket } from "../../../core/models/support-ticket.model";
import { ToastService } from "../../../core/services/toast.service";
import { SubscriptionComponent } from "./subscription.component";
import { Invoice, PlanKey } from "../../../core/models/subscription.model";
import { AuthService } from "../../../core/auth/auth.service";

describe("SubscriptionComponent", () => {
  let fixture: ComponentFixture<SubscriptionComponent>;
  let component: SubscriptionComponent;
  let service: jasmine.SpyObj<SubscriptionService>;
  let tickets: jasmine.SpyObj<SupportTicketsService>;
  let toast: ToastService;

  const ticket: SupportTicket = {
    id: "t1",
    subject: "Demande",
    message: "…",
    status: "open",
    kind: "upgrade",
    contact_phone: "+216 22 123 456",
    created_at: "2026-01-01T00:00:00Z",
    attachments: [],
  };


  function build(patch: Partial<SubscriptionInfo> = {}): void {
    TestBed.resetTestingModule();
    service = jasmine.createSpyObj<SubscriptionService>("SubscriptionService", ["get"]);
    service.get.and.returnValue(
      of({
        subscription: {
          id: "s1",
          active: true,
          billing_period: "monthly",
          lock_reason: null,
          paid_through: "2099-12-31",
          current_period_paid: true,
          days_before_lock: null,
          trial: false,
          trial_days_left: null,
          plan: "starter",
          member_app: false,
          multi_salle: false,
        },
        invoices: [],
        companies_count: 1,
        clients_used: 10,
        staff_used: 2,
        currency: "TND",
        currency_symbol: "DT",
        monthly_subscription_cents: 9900,
        annual_subscription_cents: 100_980,
        annual_discount_percent: 15,
        arrears_cents: 0,
        trial_days: 14,
        included_modules: [],
        plans: [],
        payout: null,
        ...patch,
      } as SubscriptionInfo)
    );

    tickets = jasmine.createSpyObj<SupportTicketsService>("SupportTicketsService", ["create", "list"]);
    tickets.create.and.returnValue(of({ support_ticket: ticket }));

    TestBed.configureTestingModule({
      imports: [SubscriptionComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideHttpClientTesting(),
        { provide: SubscriptionService, useValue: service },
        { provide: SupportTicketsService, useValue: tickets },
      ],
    });

    fixture = TestBed.createComponent(SubscriptionComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it("reads access as the boolean it is", () => {
    expect(component.accessOpen()).toBe(true);
    expect(component.currentPeriodPaid()).toBe(true);
  });

  it("sets the error flag when loading fails", () => {
    service.get.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  it("reports what is owed from the server, never from a typed-in field", () => {
    build({ arrears_cents: 19_800 });
    expect(component.arrears()).toBe(198);
  });

  it("opens the picker on the period the account is billed on", () => {
    expect(component.billingPeriod()).toBe("monthly");

    build({ subscription: { ...component.info()!.subscription!, billing_period: "yearly" } });

    expect(component.billingPeriod()).toBe("yearly");
  });

  describe("where access stands", () => {
    const pill = () => fixture.nativeElement.querySelector(".sub-pill") as HTMLElement;

    it("reads open while the period is paid", () => {
      expect(component.accessState()).toBe("open");
      expect(pill().getAttribute("data-state")).toBe("open");
    });

    it("reads due while a period waits for payment, and counts down to the lock", () => {
      build({ subscription: { ...component.info()!.subscription!, current_period_paid: false, days_before_lock: 5 } });

      expect(component.accessState()).toBe("due");
      expect(fixture.nativeElement.querySelector(".sub-period-due").textContent).toContain("subscription.state_due");
    });

    it("reads closed once access is shut", () => {
      build({ subscription: { ...component.info()!.subscription!, active: false, lock_reason: "unpaid" } });

      expect(pill().getAttribute("data-state")).toBe("closed");
    });
  });

  describe("the current period", () => {
    const invoice = (period_start: string, period_end: string): Invoice => ({
      id: period_start,
      number: "F-1",
      period_start,
      period_end,
      amount: 99,
      currency: "TND",
      billing_period: "yearly",
      plan: "starter",
      trial: false,
      issued_at: "2026-01-01T00:00:00Z",
      issued_by: null,
      notes: null,
    });

    it("is the invoice that covers today, not merely the newest", () => {
      build({ invoices: [invoice("2099-01-01", "2099-12-31"), invoice("2000-01-01", "2098-12-31")] });

      const period = component.period()!;
      expect(period.start).toBe("2000-01-01");
      expect(period.percent).toBeGreaterThan(0);
      expect(period.percent).toBeLessThan(100);
      expect(fixture.nativeElement.querySelector(".sub-period-bar")).not.toBeNull();
    });

    it("draws no bar before any invoice", () => {
      expect(component.period()).toBeNull();
      expect(fixture.nativeElement.querySelector(".sub-period-bar")).toBeNull();
    });
  });

  describe("the plans", () => {
    function withPlans(plan: PlanKey) {
      component.info.set({
        ...component.info()!,
        subscription: { ...component.info()!.subscription!, plan, member_app: plan === "pro", multi_salle: plan === "pro" },
        companies_count: 3,
        staff_used: 2,
        clients_used: 148,
        annual_discount_percent: 20,
        plans: [
          { key: "starter", monthly_cents: 9900, annual_cents: 95040 },
          { key: "pro", monthly_cents: 14900, annual_cents: 143040 },
        ],
      });
      fixture.detectChanges();
    }

    function pick(key: PlanKey) {
      component.picked.set(key);
      fixture.detectChanges();
    }

    const all = (selector: string) => fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>;
    const one = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;

    it("offers both plans, not only the one the account is on", () => {
      withPlans("starter");

      expect(component.plans().map((p) => p.key)).toEqual(["starter", "pro"]);
      expect(all(".sub-opt").length).toBe(2);
    });

    it("marks exactly the plan the account is on, and ticks it first", () => {
      withPlans("pro");

      expect(component.plans().filter((p) => p.current).map((p) => p.key)).toEqual(["pro"]);
      expect(all(".sub-opt-chip").length).toBe(1);
      expect(component.pickedPlan()!.key).toBe("pro");
      expect(all(".sub-opt.is-picked").length).toBe(1);
      expect(component.currentPlanName()).toBe("subscription.plan_pro");
    });

    it("switches the prices to the yearly ones", () => {
      withPlans("starter");
      expect(component.plans()[0].price).toBe(99);

      component.billingPeriod.set("yearly");

      expect(component.plans()[0].price).toBe(950.4);
    });

    it("counts every salle the account covers, with no cap", () => {
      withPlans("starter");

      expect(component.usage()[0]).toEqual({ key: "companies", icon: "bi-building", value: "3" });
    });

    // Both plans carry every module; what Pro adds is several salles, the
    // member app and the updates.
    it("lists every module and the moderators as in every plan", () => {
      build({ included_modules: ["clients", "billing"] });
      withPlans("starter");

      expect(component.includedEverywhere().map((i) => i.key)).toEqual(["clients", "billing", "shared_team"]);
      expect(all(".sub-incl-list li").length).toBe(3);
    });

    it("keeps several salles, the member app and the updates for Pro", () => {
      withPlans("starter");

      expect(component.proFeatures().map((f) => f.key)).toEqual(["multi_salle", "member_app", "updates"]);
    });

    it("shows what Pro adds as missing on Starter, and as held on Pro", () => {
      withPlans("starter");
      expect(all(".sub-pro-tile.is-off").length).toBe(3);

      withPlans("pro");
      expect(all(".sub-pro-tile.is-off").length).toBe(0);
    });

    it("has nothing to ask for on the plan and period already billed", () => {
      withPlans("starter");

      expect(all(".sub-cta.is-current").length).toBe(1);
      expect(all(".sub-cta.is-request").length).toBe(0);
    });

    it("offers the other plan as a request", () => {
      withPlans("starter");
      pick("pro");

      const cta = one(".sub-cta.is-request");
      expect(cta.textContent).toContain("subscription.request_plan_cta");
      cta.click();
      expect(component.requestPlan()!.key).toBe("pro");
    });

    it("offers the same plan on the other period as a billing switch", () => {
      withPlans("starter");
      component.billingPeriod.set("yearly");
      fixture.detectChanges();

      expect(component.pickSwitchesPeriod()).toBeTrue();
      expect(one(".sub-cta.is-request").textContent).toContain("subscription.switch_to_yearly");
    });

    it("warns before Starter takes the member app away", () => {
      withPlans("pro");
      pick("starter");

      expect(all(".sub-warn").length).toBe(1);
    });

    it("does not warn when there is no member app to lose", () => {
      withPlans("starter");
      component.billingPeriod.set("yearly");
      fixture.detectChanges();

      expect(all(".sub-warn").length).toBe(0);
    });

    it("sends the request as a support ticket, then reports it on the picker", () => {
      withPlans("starter");
      const success = spyOn(toast, "success");

      component.openRequest(component.plans()[1]);
      component.requestPhone.set(" +216 22 123 456 ");
      component.requestNote.set("  On ouvre en novembre.  ");
      component.submitRequest();

      const [subject, message, files, extras] = tickets.create.calls.mostRecent().args;
      expect(subject).toContain("subscription.request_subject");
      expect(message).toContain("On ouvre en novembre.");
      expect(files).toEqual([]);
      expect(extras).toEqual({ kind: "upgrade", contact_phone: "+216 22 123 456" });
      expect(component.requestPlan()).toBeNull();
      expect(component.requested(component.plans()[1])).toBeTrue();
      expect(success).toHaveBeenCalled();

      pick("pro");
      expect(all(".sub-cta.is-sent").length).toBe(1);
      expect(all(".sub-cta.is-request").length).toBe(0);
    });

    it("still offers the plan on the other period once one was asked for", () => {
      withPlans("starter");
      component.openRequest(component.plans()[1]);
      component.requestPhone.set("22123456");
      component.submitRequest();

      component.billingPeriod.set("yearly");

      expect(component.requested(component.plans()[1])).toBeFalse();
    });

    it("sends the message alone when nothing was typed", () => {
      withPlans("starter");

      component.openRequest(component.plans()[1]);
      component.requestPhone.set("22123456");
      component.submitRequest();

      expect(tickets.create.calls.mostRecent().args[1]).toBe("subscription.request_body");
    });

    it("keeps the dialog open and says so when sending fails", () => {
      withPlans("starter");
      tickets.create.and.returnValue(throwError(() => new Error("nope")));
      const error = spyOn(toast, "error");

      component.openRequest(component.plans()[1]);
      component.requestPhone.set("22123456");
      component.submitRequest();

      expect(component.requesting()).toBeFalse();
      expect(component.requestPlan()).not.toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it("will not close or send twice while a request is in flight", () => {
      withPlans("starter");
      component.openRequest(component.plans()[1]);
      component.requesting.set(true);

      component.closeRequest();
      component.submitRequest();

      expect(component.requestPlan()).not.toBeNull();
      expect(tickets.create).not.toHaveBeenCalled();
    });

    // Payment happens off-app: Gymly calls back to set the plan up.
    describe("the number to call back on", () => {
      it("will not send without one, and says so on the field", () => {
        withPlans("starter");
        component.openRequest(component.plans()[1]);
        component.requestPhone.set("");
        component.submitRequest();
        fixture.detectChanges();

        expect(tickets.create).not.toHaveBeenCalled();
        expect(component.requestPlan()).not.toBeNull();
        const input = document.querySelector("#upgrade-phone") as HTMLInputElement;
        expect(input.classList).toContain("is-invalid");
        expect(document.querySelector(".invalid-feedback")!.textContent).toContain("subscription.request_phone_required");
      });

      it("will not send one that is not a number", () => {
        withPlans("starter");
        component.openRequest(component.plans()[1]);
        component.requestPhone.set("appelez-moi");
        component.submitRequest();
        fixture.detectChanges();

        expect(tickets.create).not.toHaveBeenCalled();
        expect(document.querySelector(".invalid-feedback")!.textContent).toContain("subscription.request_phone_invalid");
      });

      it("is not shown in red before a first attempt", () => {
        withPlans("starter");
        component.openRequest(component.plans()[1]);
        component.requestPhone.set("");
        fixture.detectChanges();

        expect((document.querySelector("#upgrade-phone") as HTMLInputElement).classList).not.toContain("is-invalid");
      });

      it("starts from the admin's own number", () => {
        (TestBed.inject(AuthService) as unknown as { currentUser: () => unknown }).currentUser = () => ({ phone: "+216 98 765 432" });
        withPlans("starter");
        component.openRequest(component.plans()[1]);

        expect(component.requestPhone()).toBe("+216 98 765 432");
      });
    });

    it("draws no picker when the payload carries no plans", () => {
      component.info.set({ ...component.info()!, plans: [] });
      fixture.detectChanges();

      expect(all(".sub-opt").length).toBe(0);
      expect(one(".sub-change")).toBeNull();
    });

    // A new account has paid nothing and chosen nothing: it is on the free
    // trial, not on Starter because Starter happens to be the default.
    describe("on the free trial", () => {
      function onTrial(daysLeft: number, active = true) {
        withPlans("starter");
        component.info.set({
          ...component.info()!,
          subscription: {
            ...component.info()!.subscription!,
            active,
            lock_reason: active ? null : "unpaid",
            current_period_paid: daysLeft > 0,
            trial: true,
            trial_days_left: daysLeft,
            // The trial is the whole product: the backend opens the app,
            // and several salles.
            member_app: true,
            multi_salle: true,
          },
        });
        fixture.detectChanges();
      }

      it("is on the trial, with no plan chosen", () => {
        onTrial(9);

        expect(component.plans().map((p) => p.key)).toEqual(["starter", "pro"]);
        expect(component.plans().some((p) => p.current)).toBeFalse();
        expect(component.currentPlanName()).toBe("subscription.tier_trial");
        expect(one(".sub-pill").getAttribute("data-state")).toBe("trial");
      });

      it("is free, and says how long it lasts", () => {
        onTrial(9);

        const price = one(".sub-plan-price").textContent;
        expect(price).toContain("subscription.trial_price");
        expect(price).toContain("subscription.trial_length");
        expect(one(".sub-period").textContent).toContain("subscription.days_left");
      });

      it("carries the whole product, member app included", () => {
        onTrial(9);

        expect(all(".sub-pro-tile.is-off").length).toBe(0);
      });

      it("ticks Pro, the closest to it, and offers it as a request", () => {
        onTrial(9);

        expect(component.pickedPlan()!.key).toBe("pro");
        expect(all(".sub-cta.is-request").length).toBe(1);
        expect(all(".sub-cta.is-current").length).toBe(0);
      });

      it("warns that Starter drops the app the trial had", () => {
        onTrial(9);
        pick("starter");

        expect(all(".sub-warn").length).toBe(1);
      });

      it("reads closed once it has ended, with no plan current", () => {
        onTrial(0, false);

        expect(component.plans().some((p) => p.current)).toBeFalse();
        expect(component.currentPlanName()).toBe("subscription.tier_trial_over");
        expect(one(".sub-pill").getAttribute("data-state")).toBe("closed");
      });
    });
  });
});
