import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { ConfirmService } from "../../../core/services/confirm.service";
import { MobileAppKeys, MobileAppService } from "../../../core/services/mobile-app.service";
import { SettingsMobileAppComponent } from "./settings-mobile-app.component";

describe("SettingsMobileAppComponent", () => {
  let fixture: ComponentFixture<SettingsMobileAppComponent>;
  let component: SettingsMobileAppComponent;
  let service: jasmine.SpyObj<MobileAppService>;
  let confirm: jasmine.SpyObj<ConfirmService>;

  const keys: MobileAppKeys = {
    member_code: "k7m2q9xa",
    coach_key: "abcd2345efgh",
    member_qr_svg: '<svg class="qr-member"></svg>',
    coach_qr_svg: '<svg class="qr-coach"></svg>',
  };

  function build(response = of(keys)): void {
    TestBed.resetTestingModule();
    service = jasmine.createSpyObj<MobileAppService>("MobileAppService", ["keys", "regenerate"]);
    service.keys.and.returnValue(response);
    confirm = jasmine.createSpyObj<ConfirmService>("ConfirmService", ["ask"]);

    TestBed.configureTestingModule({
      imports: [SettingsMobileAppComponent, TranslateModule.forRoot()],
      providers: [
        { provide: MobileAppService, useValue: service },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    fixture = TestBed.createComponent(SettingsMobileAppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it("shows both keys in capitals, each with its QR code", () => {
    build();
    const el = fixture.nativeElement as HTMLElement;

    expect(Array.from(el.querySelectorAll(".ma-key")).map((k) => k.textContent?.trim())).toEqual(["K7M2Q9XA", "ABCD2345EFGH"]);
    expect(el.querySelector(".ma-qr svg.qr-member")).not.toBeNull();
    expect(el.querySelector(".ma-qr svg.qr-coach")).not.toBeNull();
  });

  it("shows the error state when the keys do not load", () => {
    build(throwError(() => new Error("nope")));

    expect(component.error()).toBeTrue();
  });

  it("regenerates a key only once confirmed", async () => {
    build();
    service.regenerate.and.returnValue(of({ ...keys, coach_key: "zzzz2345yyyy" }));

    confirm.ask.and.resolveTo(false);
    await component.regenerate(component.cards()[1]);
    expect(service.regenerate).not.toHaveBeenCalled();

    confirm.ask.and.resolveTo(true);
    await component.regenerate(component.cards()[1]);
    expect(service.regenerate).toHaveBeenCalledWith("coach");
    expect(component.keys()?.coach_key).toBe("zzzz2345yyyy");
  });
});
