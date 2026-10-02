import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { SuperadminCompany } from "../../../core/models/superadmin-company.model";
import { SuperadminCompaniesService } from "../../../core/services/superadmin-companies.service";
import { SuperadminCompaniesComponent } from "./companies.component";

describe("SuperadminCompaniesComponent", () => {
  let fixture: ComponentFixture<SuperadminCompaniesComponent>;
  let component: SuperadminCompaniesComponent;
  let service: jasmine.SpyObj<SuperadminCompaniesService>;

  const meta = { page: 1, per_page: 20, total: 1, total_pages: 1 };
  const company: SuperadminCompany = {
    arrears_cents: 0,
    next_invoice: null,
    access_open: true,
    usage: { clients: 0, staff: 0, activities: 0, sessions_last_30_days: 0, last_session_at: null },
    id: "c1",
    name: "Acme Gym",
    city: "Tunis",
    country: "TN",
    currency: "TND",
    currency_symbol: "DT",
    locale: "fr",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    admin: { id: "o1", full_name: "Sami Admin", email: "sami@x.test", phone: null, companies_count: 1 },
    plan: "starter",
    account_companies: [],
    subscription: null,
    monthly_subscription_cents: 15000,
    annual_subscription_cents: 162000,
    annual_discount_percent: 10,
    included_modules: [],
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<SuperadminCompaniesService>("SuperadminCompaniesService", ["list"]);
    service.list.and.returnValue(of({ companies: [company], meta, closed_count: 0 }));

    await TestBed.configureTestingModule({
      imports: [SuperadminCompaniesComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: SuperadminCompaniesService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperadminCompaniesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("loads the first page on init", () => {
    expect(service.list).toHaveBeenCalledWith(1, undefined, false);
    expect(component.companies().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it("sets the error flag when loading fails", () => {
    service.list.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
    expect(component.loading()).toBe(false);
  });

  it("onSearchChange debounces, resets to page 1, and passes the term", fakeAsync(() => {
    component.page.set(3);
    component.onSearchChange("acme");
    expect(service.list).not.toHaveBeenCalledWith(1, "acme", false);

    tick(1000);

    expect(component.page()).toBe(1);
    expect(service.list).toHaveBeenCalledWith(1, "acme", false);
  }));

  it("onSearchChange restarts the debounce timer on rapid typing", fakeAsync(() => {
    component.onSearchChange("ac");
    tick(500);
    component.onSearchChange("acme"); // clears the still-pending first timer
    tick(500);
    expect(service.list).not.toHaveBeenCalledWith(1, "acme", false);
    tick(500);
    expect(service.list).toHaveBeenCalledWith(1, "acme", false);
  }));

  it("onPageChange loads the requested page", () => {
    component.onPageChange(2);
    expect(component.page()).toBe(2);
    expect(service.list).toHaveBeenCalledWith(2, undefined, false);
  });

  // Removing the separate inbox must not lose the signal: a gym that asked
  // to carry on has to be visible without opening its page.
  describe("gyms whose access is shut", () => {
    it("reports how many are waiting, even while the list shows everyone", () => {
      service.list.and.returnValue(of({ companies: [company], meta, closed_count: 3 }));
      component.load();
      expect(component.closedCount()).toBe(3);
      expect(component.onlyClosed()).toBe(false);
    });

    it("narrows to them on request, and back again", () => {
      component.toggleClosed();
      expect(component.onlyClosed()).toBe(true);
      expect(service.list).toHaveBeenCalledWith(1, undefined, true);

      component.toggleClosed();
      expect(component.onlyClosed()).toBe(false);
      expect(service.list).toHaveBeenCalledWith(1, undefined, false);
    });

    it("returns to the first page when narrowing, so nothing hides on page 2", () => {
      component.page.set(4);
      component.toggleClosed();
      expect(component.page()).toBe(1);
    });
  });
});

