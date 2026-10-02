import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { Subject, of, throwError } from "rxjs";
import { SuperadminSubscriptionPricingService, SubscriptionPricing } from "../../../core/services/superadmin-subscription-pricing.service";
import { ToastService } from "../../../core/services/toast.service";
import { SuperadminPricingComponent } from "./pricing.component";

describe("SuperadminPricingComponent", () => {
  let fixture: ComponentFixture<SuperadminPricingComponent>;
  let component: SuperadminPricingComponent;
  let service: jasmine.SpyObj<SuperadminSubscriptionPricingService>;
  let toast: ToastService;

  const pricing: SubscriptionPricing = {
    currencies: ["TND", "EUR"],
    currency: "TND",
    annual_discount_percent: 10,
    companies_count: 5,
    plans: [
      { plan: "starter", monthly_cents: 15000, annual_cents: 162000, accounts_count: 4 },
      { plan: "pro", monthly_cents: 25000, annual_cents: 270000, accounts_count: 1 },
    ],
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<SuperadminSubscriptionPricingService>("SuperadminSubscriptionPricingService", ["get", "update"]);
    service.get.and.returnValue(of(pricing));

    await TestBed.configureTestingModule({
      imports: [SuperadminPricingComponent, TranslateModule.forRoot()],
      providers: [{ provide: SuperadminSubscriptionPricingService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperadminPricingComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it("loads pricing for the default currency on init and hydrates both plans", () => {
    expect(service.get).toHaveBeenCalledWith("TND");
    expect(component.plans().map((p) => [p.plan, p.monthlyUnits, p.accountsCount])).toEqual([
      ["starter", 150, 4],
      ["pro", 250, 1],
    ]);
    expect(component.discount()).toBe(10);
    expect(component.loading()).toBe(false);
  });

  it("sets the error flag when loading fails", () => {
    service.get.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  it("onCurrencyChange reloads pricing for the new currency", () => {
    component.onCurrencyChange("EUR");
    expect(service.get).toHaveBeenCalledWith("EUR");
  });

  it("dirty is false right after loading", () => {
    expect(component.dirty).toBe(false);
  });

  it("dirty is false before pricing has ever loaded", () => {
    const pending = new Subject<SubscriptionPricing>();
    service.get.and.returnValue(pending);
    const fresh = TestBed.createComponent(SuperadminPricingComponent);
    fresh.detectChanges();
    expect(fresh.componentInstance.dirty).toBe(false);
  });

  it("dirty is true once a plan's price or the discount changes", () => {
    component.plans()[0].monthlyUnits = 200;
    expect(component.dirty).toBe(true);
  });

  it("previews the year at the discount being typed, before saving", () => {
    const pro = component.plans()[1];
    expect(component.annualUnits(pro)).toBe(2700);

    component.discount.set(20);

    expect(component.annualUnits(pro)).toBe(2400);
  });

  it("save() sends both plans' prices keyed by plan, clamping negatives to 0", () => {
    component.plans()[0].monthlyUnits = -5;
    service.update.and.returnValue(of(pricing));

    component.save();

    expect(service.update).toHaveBeenCalledWith({
      currency: "TND",
      plans: { starter: 0, pro: 25000 },
      annual_discount_percent: 10,
    });
    expect(component.saving()).toBe(false);
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("save() shows an error toast on failure", () => {
    service.update.and.returnValue(throwError(() => new Error("nope")));
    component.save();
    expect(component.saving()).toBe(false);
    expect(toast.toasts()[0].kind).toBe("error");
  });
});
