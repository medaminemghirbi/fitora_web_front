import { TestBed } from "@angular/core/testing";
import { TranslateService } from "@ngx-translate/core";
import { LocaleService } from "./locale.service";

describe("LocaleService", () => {
  let service: LocaleService;
  let translateStub: jasmine.SpyObj<TranslateService>;

  beforeEach(() => {
    localStorage.clear();
    translateStub = jasmine.createSpyObj<TranslateService>("TranslateService", ["addLangs", "setDefaultLang", "use"]);

    TestBed.configureTestingModule({
      providers: [{ provide: TranslateService, useValue: translateStub }],
    });
    service = TestBed.inject(LocaleService);
  });

  afterEach(() => localStorage.clear());

  it("defaults to fr when nothing is stored", () => {
    expect(service.locale()).toBe("fr");
    expect(translateStub.use).toHaveBeenCalledWith("fr");
  });

  it("setLocale updates the signal, persists it, and sets dir/lang on <html>", () => {
    service.setLocale("ar");
    expect(service.locale()).toBe("ar");
    expect(localStorage.getItem("fitora_locale")).toBe("ar");
    expect(translateStub.use).toHaveBeenCalledWith("ar");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });

  it("setLocale sets dir=ltr for a non-RTL locale", () => {
    service.setLocale("en");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("isRtl reflects the current locale", () => {
    expect(service.isRtl()).toBe(false);
    service.setLocale("ar");
    expect(service.isRtl()).toBe(true);
  });

  it("applyCompanyLocale switches to a supported, different locale", () => {
    service.applyCompanyLocale("en");
    expect(service.locale()).toBe("en");
  });

  it("applyCompanyLocale is a no-op for an unsupported locale", () => {
    service.applyCompanyLocale("de");
    expect(service.locale()).toBe("fr");
  });

  it("applyCompanyLocale is a no-op when already on that locale", () => {
    service.setLocale("en");
    translateStub.use.calls.reset();
    service.applyCompanyLocale("en");
    expect(translateStub.use).not.toHaveBeenCalled();
  });

  it("applyCompanyLocale is a no-op for null/undefined", () => {
    service.applyCompanyLocale(null);
    service.applyCompanyLocale(undefined);
    expect(service.locale()).toBe("fr");
  });
});
