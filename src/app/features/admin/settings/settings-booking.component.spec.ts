import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { Company, CompanySettings } from "../../../core/models/company.model";
import { CompanyService } from "../../../core/services/company.service";
import { ToastService } from "../../../core/services/toast.service";
import { SettingsBookingComponent } from "./settings-booking.component";

function settings(overrides: Partial<CompanySettings> = {}): CompanySettings {
  return {
    features: {
      bookings: true, spaces: false, attendance: true, revenue: true,
      reports: true, online_booking: true, waitlist: false, drop_in: true, packs: false,
    },
    booking: {
      cancellation_hours: 2, booking_opens_days: 14, no_show_consumes_session: true,
      reminder_hours: 24, reminder_sms: false,
    },
    hours: { start: "06:00", end: "22:00", working_days: [1, 2, 3, 4, 5] },
    branding: { primary_color: null },
    ...overrides,
  };
}

describe("SettingsBookingComponent", () => {
  let fixture: ComponentFixture<SettingsBookingComponent>;
  let component: SettingsBookingComponent;
  let companyService: jasmine.SpyObj<CompanyService>;
  let configuration: jasmine.SpyObj<ConfigurationService>;

  async function build(initial = settings()) {
    companyService = jasmine.createSpyObj<CompanyService>("CompanyService", ["get", "update"]);
    companyService.get.and.returnValue(of({ company: { settings: initial } as Company }) as never);
    companyService.update.and.returnValue(of({ company: { settings: initial } as Company }) as never);
    configuration = jasmine.createSpyObj<ConfigurationService>("ConfigurationService", ["load"]);
    configuration.load.and.returnValue(of({}) as never);

    await TestBed.configureTestingModule({
      imports: [SettingsBookingComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CompanyService, useValue: companyService },
        { provide: ConfigurationService, useValue: configuration },
        { provide: ToastService, useValue: jasmine.createSpyObj("ToastService", ["success", "error"]) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsBookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it("loads the gym's own rules rather than assuming the defaults", async () => {
    await build(settings({ booking: { ...settings().booking, cancellation_hours: 24, booking_opens_days: 7, no_show_consumes_session: false } }));

    expect(component.settings()?.booking.cancellation_hours).toBe(24);
  });

  it("sends only the section that changed, so an unrelated rule cannot be clobbered", async () => {
    await build();

    component.setRule("cancellation_hours", 12);

    expect(companyService.update).toHaveBeenCalledWith({ settings: { booking: { cancellation_hours: 12 } } } as never);
  });

  it("saves a toggle immediately — a switch needing a Save button is a switch left unsaved", async () => {
    await build();

    component.setFeature("waitlist", true);

    expect(companyService.update).toHaveBeenCalledWith({ settings: { features: { waitlist: true } } } as never);
  });

  it("takes the server's version back, since it clamps and drops", async () => {
    await build();
    // The server refuses 10_000 hours and stores the ceiling instead.
    companyService.update.and.returnValue(
      of({ company: { settings: settings({ booking: { ...settings().booking, cancellation_hours: 168 } }) } as Company }) as never
    );

    component.setRule("cancellation_hours", 10_000);

    expect(component.settings()?.booking.cancellation_hours).toBe(168);
  });

  it("reloads after a failed save rather than leaving the guess on screen", async () => {
    await build();
    companyService.update.and.returnValue(throwError(() => new Error("nope")));
    companyService.get.calls.reset();

    component.setFeature("spaces", true);

    expect(companyService.get).toHaveBeenCalled();
  });

  it("hides the member-only rules when members do not book", async () => {
    await build(settings({
      features: { ...settings().features, online_booking: false },
    }));
    fixture.detectChanges();

    // A cancellation window and a booking horizon only bind members, so with
    // self-booking off there is nothing for them to govern.
    expect(fixture.nativeElement.querySelector("#sb-window")).toBeNull();
    expect(fixture.nativeElement.querySelector("#sb-horizon")).toBeNull();
    expect(fixture.nativeElement.querySelector("#sb-online")).toBeTruthy();
  });

  it("refreshes the app's configuration after a feature switch, so menus follow", async () => {
    await build();

    component.setFeature("packs", true);

    expect(configuration.load).toHaveBeenCalled();
  });

  it("does not refresh the configuration for a booking rule", async () => {
    await build();

    component.setRule("reminder_hours", 2);

    expect(configuration.load).not.toHaveBeenCalled();
  });

  it("offers the SMS reminder only while reminders are on", async () => {
    await build(settings({ booking: { ...settings().booking, reminder_hours: 0 } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("#sb-reminder-sms")).toBeNull();

    companyService.update.and.returnValue(
      of({ company: { settings: settings({ booking: { ...settings().booking, reminder_hours: 24 } }) } as Company }) as never
    );
    component.setRule("reminder_hours", 24);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("#sb-reminder-sms")).toBeTruthy();
  });
});
