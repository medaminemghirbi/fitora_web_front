import { WritableSignal, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { Locale, LocaleService } from "../../core/services/locale.service";
import { LandingComponent } from "./landing.component";

describe("LandingComponent", () => {
  let fixture: ComponentFixture<LandingComponent>;
  let component: LandingComponent;
  let localeStub: { locale: WritableSignal<Locale>; setLocale: jasmine.Spy };

  beforeEach(async () => {
    localeStub = { locale: signal<Locale>("fr"), setLocale: jasmine.createSpy("setLocale") };

    await TestBed.configureTestingModule({
      imports: [LandingComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: LocaleService, useValue: localeStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("exposes the current year", () => {
    expect(component.year()).toBe(new Date().getFullYear());
  });

  it("lists the supported locales", () => {
    expect(component.locales.length).toBeGreaterThan(0);
  });

  it("setLocale switches the language and closes the language menu", () => {
    component.langMenuOpen.set(true);
    component.setLocale("en");
    expect(localeStub.setLocale).toHaveBeenCalledWith("en");
    expect(component.langMenuOpen()).toBe(false);
  });

  it("shows the six features", () => {
    expect(fixture.nativeElement.querySelectorAll(".lp-feature").length).toBe(6);
  });

  it("anchors every nav link to a section that exists", () => {
    for (const id of ["features", "flow", "pricing", "faq"]) {
      expect(fixture.nativeElement.querySelector(`#${id}`)).withContext(id).toBeTruthy();
    }
  });

  describe("the hero's day", () => {
    it("dates the card today, in the page's language, capitalised", () => {
      const expected = new Intl.DateTimeFormat("fr", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
      expect(component.todayLabel()).toBe(expected.charAt(0).toUpperCase() + expected.slice(1));

      localeStub.locale.set("en");
      expect(component.todayLabel()).toContain(new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date()));
    });

    it("fills each class's bar by bookings over capacity, never past full", () => {
      expect(component.fill({ time: "", name: "", coach: "", room: "", booked: 2, capacity: 4, waitlist: 0 })).toBe(50);
      expect(component.fill({ time: "", name: "", coach: "", room: "", booked: 14, capacity: 12, waitlist: 2 })).toBe(100);
    });

    it("marks a group full once every place is booked, but never a one-to-one slot", () => {
      const full = component.todayClasses.filter((c) => component.isFull(c));
      expect(full.map((c) => c.name)).toEqual(["Pilates Reformer"]);
      expect(component.isFull({ time: "", name: "", coach: "", room: "", booked: 1, capacity: 1, waitlist: 0 })).toBe(false);
      expect(fixture.nativeElement.querySelectorAll(".lp-today-fill.is-full").length).toBe(1);
    });
  });

  describe("FAQ accordion", () => {
    it("starts with the first question open", () => {
      expect(component.openFaq()).toBe(1);
      expect(fixture.nativeElement.querySelectorAll(".lp-faq-a:not([hidden])").length).toBe(1);
    });

    it("toggleFaq opens a different question and closes the previous one", () => {
      component.toggleFaq(3);
      expect(component.openFaq()).toBe(3);
    });

    it("toggleFaq closes the currently open question when clicked again", () => {
      component.toggleFaq(1);
      expect(component.openFaq()).toBeNull();
    });
  });

  describe("pricing", () => {
    const digits = (s: string) => s.replace(/[^0-9,.]/g, "");

    it("shows each plan's monthly price by default", () => {
      expect(component.plans.map((p) => digits(component.priceOf(p)))).toEqual(["165", "249"]);
    });

    it("switches to the year's total after the annual discount", () => {
      component.billing.set("yearly");
      // 165 × 12 × 0.9 = 1 782 ; 249 × 12 × 0.9 = 2 689,20
      expect(component.plans.map((p) => digits(component.priceOf(p)))).toEqual(["1782", "2689,20"]);
    });
  });

  describe("the booking mock", () => {
    it("offers the next three days", () => {
      expect(component.bookingDays().length).toBe(3);
    });

    it("picks a free slot but refuses a taken one", () => {
      component.pickDay(0);
      component.pickSlot("07:30");
      expect(component.selectedSlot()).toBe("07:30");

      component.pickSlot("12:30"); // taken on the first day
      expect(component.isTaken("12:30")).toBeTrue();
      expect(component.selectedSlot()).toBe("07:30");
    });
  });

  describe("the closing form", () => {
    it("hands the first name and e-mail over to /inscription", () => {
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, "navigate").and.resolveTo(true);
      component.startForm.setValue({ first_name: " Sarah ", email: "sarah@studio.tn" });
      component.start();
      expect(navigate).toHaveBeenCalledWith(["/inscription"], { queryParams: { first_name: "Sarah", email: "sarah@studio.tn" } });
    });

    it("does not leave with an invalid e-mail", () => {
      const navigate = spyOn(TestBed.inject(Router), "navigate");
      component.startForm.setValue({ first_name: "", email: "not-an-email" });
      component.start();
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
