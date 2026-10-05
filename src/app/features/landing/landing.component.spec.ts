import { WritableSignal, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
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

  it("numbers the six features 01 to 06", () => {
    const numbers = Array.from(fixture.nativeElement.querySelectorAll(".lp-feature-n") as NodeListOf<HTMLElement>).map((n) =>
      n.textContent?.trim()
    );
    expect(numbers).toEqual(["01", "02", "03", "04", "05", "06"]);
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
});
