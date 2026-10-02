import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TranslateModule } from "@ngx-translate/core";
import { Subject, of, throwError } from "rxjs";
import { SuperadminCompany } from "../../../core/models/superadmin-company.model";
import { Invoice } from "../../../core/models/subscription.model";
import { SuperadminCompaniesService } from "../../../core/services/superadmin-companies.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { SuperadminCompanyDetailComponent } from "./company-detail.component";

describe("SuperadminCompanyDetailComponent", () => {
  let fixture: ComponentFixture<SuperadminCompanyDetailComponent>;
  let component: SuperadminCompanyDetailComponent;
  let service: jasmine.SpyObj<SuperadminCompaniesService>;
  let confirm: ConfirmService;

  const company = {
    id: "c1",
    name: "Salle Sousse",
    city: "Sousse",
    country: "TN",
    currency: "TND",
    currency_symbol: "DT",
    locale: "fr",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    admin: { id: "u1", full_name: "Amine", email: "a@x.test", phone: null, companies_count: 1 },
    plan: "starter",
    account_companies: [{ id: "c1", name: "Salle Sousse", city: "Sousse", current: true }],
    subscription: {
      id: "s1",
      active: true,
      billing_period: "monthly",
      plan: "starter",
      member_app: false,
      multi_salle: false,
      lock_reason: null,
      paid_through: "2099-12-31",
      current_period_paid: true,
      days_before_lock: null,
    },
    access_open: true,
    arrears_cents: 0,
    usage: { clients: 0, staff: 0, activities: 0, sessions_last_30_days: 0, last_session_at: null },
    monthly_subscription_cents: 9900,
    annual_subscription_cents: 100_980,
    annual_discount_percent: 15,
    included_modules: [],
  } as unknown as SuperadminCompany;

  function invoice(patch: Partial<Invoice> = {}): Invoice {
    return {
      id: "inv1",
      number: "FIT-2026-0042",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      amount: 99,
      currency: "TND",
      billing_period: "monthly",
      issued_at: "2026-09-02T00:00:00Z",
      issued_by: "Amine",
      notes: null,
      ...patch,
    } as Invoice;
  }

  function build(patch: Partial<SuperadminCompany> = {}, invoices: Invoice[] = []): void {
    TestBed.resetTestingModule();
    service = jasmine.createSpyObj<SuperadminCompaniesService>("SuperadminCompaniesService", [
      "get",
      "invoices",
      "issueInvoice",
      "voidInvoice",
      "updateSubscription",
      "updateSettings",
      "impersonate",
    ]);
    service.get.and.returnValue(
      of({ company: { ...company, ...patch } as SuperadminCompany, currency_options: [], locale_options: [] })
    );
    service.invoices.and.returnValue(of({ invoices }));

    TestBed.configureTestingModule({
      imports: [SuperadminCompanyDetailComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SuperadminCompaniesService, useValue: service },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: "c1" })) } },
      ],
    });

    fixture = TestBed.createComponent(SuperadminCompanyDetailComponent);
    component = fixture.componentInstance;
    confirm = TestBed.inject(ConfirmService);
    fixture.detectChanges();
  }

  beforeEach(() => build());

  // The plan is the account's: read off it, changed through the
  // subscription endpoint, and shown with every salle it covers.
  describe("the plan", () => {
    const pro = { ...company, plan: "pro", subscription: { ...company.subscription!, plan: "pro", member_app: true } } as SuperadminCompany;

    it("reads the account's plan and whether it opens the member app", () => {
      expect(component.plan()).toBe("starter");
      expect(component.memberApp()).toBeFalse();

      build(pro);
      expect(component.plan()).toBe("pro");
      expect(component.memberApp()).toBeTrue();
    });

    it("moves the account to the chosen plan", () => {
      service.updateSubscription.and.returnValue(of({ company: pro }));

      component.changePlan("pro");

      expect(service.updateSubscription).toHaveBeenCalledWith("c1", { plan: "pro" });
      expect(component.plan()).toBe("pro");
      expect(component.savingPlan()).toBeFalse();
    });

    it("does nothing when the plan picked is the one already in force", () => {
      component.changePlan("starter");

      expect(service.updateSubscription).not.toHaveBeenCalled();
    });

    it("stops saving and reports when the change fails", () => {
      service.updateSubscription.and.returnValue(throwError(() => new Error("nope")));

      component.changePlan("pro");

      expect(component.savingPlan()).toBeFalse();
      expect(component.plan()).toBe("starter");
    });

    it("lists every salle of the account, linking to the others", () => {
      build({
        admin: { ...company.admin, companies_count: 2 },
        account_companies: [
          { id: "c1", name: "Salle Sousse", city: "Sousse", current: true },
          { id: "c2", name: "Salle Tunis", city: null, current: false },
        ],
      });

      const items = fixture.nativeElement.querySelectorAll(".ac-account-item");
      expect(items.length).toBe(2);
      expect(items[0].classList).toContain("is-current");
      expect(items[1].getAttribute("href")).toBe("/superadmin/companies/c2");
    });
  });

  it("loads the gym and its invoices", () => {
    expect(service.get).toHaveBeenCalledWith("c1");
    expect(service.invoices).toHaveBeenCalledWith("c1");
  });

  it("sets the error flag when loading fails", () => {
    service.get.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  describe("what needs deciding", () => {
    it("says nothing about a gym that is open and paid up", () => {
      expect(component.attention()).toBeNull();
    });

    it("warns while the period is unsettled but access is still open", () => {
      build({ subscription: { ...company.subscription!, current_period_paid: false, days_before_lock: 2 } });
      expect(component.attention()).toBe("due");
    });

    // With no invoice there is no period to count down from, and the "due"
    // message interpolated a null straight into the page as {{days}}.
    it("says so plainly when nothing was ever invoiced, rather than counting from nothing", () => {
      build({ subscription: { ...company.subscription!, current_period_paid: false, paid_through: null, days_before_lock: null } });

      expect(component.attention()).toBe("never");
      expect(fixture.nativeElement.textContent).not.toContain("{{days}}");
    });

    it("reports the money when access closed for want of it", () => {
      build({ access_open: false, subscription: { ...company.subscription!, active: false, lock_reason: "unpaid" } });
      expect(component.attention()).toBe("unpaid");
    });

    it("reports a decision as a decision, never as money", () => {
      build({ access_open: false, subscription: { ...company.subscription!, active: false, lock_reason: "suspended" } });
      expect(component.attention()).toBe("suspended");
    });
  });

  describe("the ledger", () => {
    it("paints a month green when an invoice covers its first day", () => {
      const year = new Date().getFullYear();
      build({}, [invoice({ period_start: `${year}-01-01`, period_end: `${year}-01-31` })]);

      component.ledgerYear.set(year);
      expect(component.ledger()[0].state).toBe("paid");
      expect(component.ledger()[0].invoice?.number).toBe("FIT-2026-0042");
    });

    // A yearly invoice is one row that has to paint twelve cells.
    it("paints a whole year from a single yearly invoice", () => {
      const year = new Date().getFullYear();
      build({}, [invoice({ period_start: `${year}-01-01`, period_end: `${year}-12-31`, billing_period: "yearly" })]);

      component.ledgerYear.set(year);
      expect(component.ledger().every((c) => c.state === "paid")).toBe(true);
      expect(component.ledgerPaidCount()).toBe(12);
    });

    it("leaves a month with no invoice as a hole, never as paid", () => {
      const year = new Date().getFullYear();
      build({}, [invoice({ period_start: `${year}-01-01`, period_end: `${year}-01-31` })]);

      component.ledgerYear.set(year);
      expect(component.ledger()[1].state).not.toBe("paid");
      expect(component.ledger()[1].invoice).toBeNull();
    });

    it("counts only what the invoices actually collected", () => {
      const year = new Date().getFullYear();
      build({}, [
        invoice({ id: "a", period_start: `${year}-01-01`, period_end: `${year}-01-31`, amount: 99 }),
        invoice({ id: "b", period_start: `${year}-02-01`, period_end: `${year}-02-28`, amount: 120 }),
      ]);

      component.ledgerYear.set(year);
      expect(component.ledgerCollected()).toBe(219);
    });

    // One yearly invoice paints twelve cells, and was paid once.
    it("counts a yearly invoice once, however many months it paints", () => {
      const year = new Date().getFullYear();
      build({}, [invoice({ period_start: `${year}-01-01`, period_end: `${year}-12-31`, billing_period: "yearly", amount: 1069.2 })]);

      component.ledgerYear.set(year);
      expect(component.ledgerCollected()).toBe(1069.2);
    });

    it("leaves the months before the gym signed up blank", () => {
      const year = new Date().getFullYear();
      build({ created_at: `${year}-06-15T00:00:00Z` });

      component.ledgerYear.set(year);
      expect(component.ledger().slice(0, 5).every((c) => c.state === "before")).toBe(true);
      expect(component.ledger()[5].state).not.toBe("before");
    });

    it("never counts the free period as collected", () => {
      const year = new Date().getFullYear();
      build({ created_at: `${year}-01-01T00:00:00Z` }, [
        invoice({ period_start: `${year}-01-01`, period_end: `${year}-01-14`, amount: 0, trial: true }),
      ]);

      component.ledgerYear.set(year);
      expect(component.ledger()[0].state).toBe("trial");
      expect(component.ledgerPaidCount()).toBe(0);
    });
  });

  // Choosing a formula during the free days changes nothing until money
  // arrives, so the page must show the trial and still offer the payment.
  describe("a gym on its free days", () => {
    const next = { period_start: "2026-10-07", period_end: "2027-10-06", amount_cents: 106_920 };

    beforeEach(() =>
      build({
        subscription: { ...company.subscription!, billing_period: "yearly", trial: true, trial_days_left: 13 },
        next_invoice: next,
      })
    );

    it("is shown as on trial, not as on the formula picked for later", () => {
      expect(component.onTrial()).toBe(true);
      expect(fixture.nativeElement.querySelector(".ac-stat--trial")).not.toBeNull();
    });

    it("can be recorded as paid before the trial runs out, with the period it will buy", () => {
      expect(component.attention()).toBeNull();
      expect(component.nextInvoice()).toEqual(next);

      service.issueInvoice.and.returnValue(of({ invoice: invoice(), company }));
      (fixture.nativeElement.querySelector(".ac-next button") as HTMLButtonElement).click();
      expect(service.issueInvoice).toHaveBeenCalledWith("c1");
    });
  });

  describe("the money arriving", () => {
    it("issues an invoice and takes the new state from the answer", () => {
      service.issueInvoice.and.returnValue(of({ invoice: invoice(), company }));

      component.issueInvoice();

      expect(service.issueInvoice).toHaveBeenCalledWith("c1");
      expect(component.savingInvoice()).toBe(false);
    });

    it("refuses a second click while one is in flight", () => {
      service.issueInvoice.and.returnValue(new Subject<never>().asObservable() as never);

      component.issueInvoice();
      component.issueInvoice();

      expect(service.issueInvoice).toHaveBeenCalledTimes(1);
    });

    it("stops spinning when it is refused", () => {
      service.issueInvoice.and.returnValue(throwError(() => new Error("no subscription")));
      component.issueInvoice();
      expect(component.savingInvoice()).toBe(false);
    });

    it("asks before voiding one, and does nothing when told no", async () => {
      const pending = component.voidInvoice(invoice());
      confirm.resolve(false);
      await pending;

      expect(service.voidInvoice).not.toHaveBeenCalled();
    });

    it("voids one once confirmed", async () => {
      service.voidInvoice.and.returnValue(of({ company }));

      const pending = component.voidInvoice(invoice());
      confirm.resolve(true);
      await pending;

      expect(service.voidInvoice).toHaveBeenCalledWith("c1", "inv1");
    });
  });

  describe("access", () => {
    it("closes an open gym and opens a closed one", () => {
      service.updateSubscription.and.returnValue(of({ company }));

      component.toggleAccess();
      expect(service.updateSubscription).toHaveBeenCalledWith("c1", { active: false });
    });

    it("sets what an invoice covers", () => {
      service.updateSubscription.and.returnValue(of({ company }));

      component.changeBillingPeriod("yearly");
      expect(service.updateSubscription).toHaveBeenCalledWith("c1", { billing_period: "yearly" });
    });
  });

    // A fixed window around today left a long-standing gym's oldest invoices
    // reachable by nothing at all.
    it("offers every year its invoices touch, however far back", () => {
      build({}, [
        invoice({ id: "old", period_start: "2023-03-01", period_end: "2023-03-31" }),
        invoice({ id: "new", period_start: "2026-09-01", period_end: "2026-09-30" }),
      ]);

      expect(component.ledgerYears()).toContain(2023);
      expect(component.ledgerYears()).toContain(2026);
    });

    it("still offers the current year for a gym with no invoices at all", () => {
      build({}, []);
      expect(component.ledgerYears()).toEqual([new Date().getFullYear()]);
    });

  describe("the two tabs", () => {
    it("opens on billing — the question the page is usually open for", () => {
      expect(component.activeTab()).toBe("billing");
    });

    it("switches to the gym and back", () => {
      component.setTab("gym");
      expect(component.activeTab()).toBe("gym");

      component.setTab("billing");
      expect(component.activeTab()).toBe("billing");
    });

    // Something that needs deciding must not sit behind a tab: that is how
    // an activation request went unseen before.
    it("keeps the banner visible whichever tab is open", () => {
      build({ subscription: { ...company.subscription!, current_period_paid: false, days_before_lock: 2 } });
      expect(fixture.nativeElement.querySelector(".ac-attention")).not.toBeNull();

      component.setTab("gym");
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".ac-attention")).not.toBeNull();
    });

    it("shows the ledger only under billing", () => {
      expect(fixture.nativeElement.querySelector(".ac-ledger")).not.toBeNull();

      component.setTab("gym");
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".ac-ledger")).toBeNull();
    });

    it("shows usage only under the gym", () => {
      expect(fixture.nativeElement.querySelector(".ac-usage")).toBeNull();

      component.setTab("gym");
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".ac-usage")).not.toBeNull();
    });
  });
});
