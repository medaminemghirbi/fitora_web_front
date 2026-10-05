import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE_URL } from "../models/api-config";
import { BrandingService } from "../services/branding.service";
import { LocaleService } from "../services/locale.service";
import { NotificationService } from "../services/notification.service";
import { Bootstrap, ConfigurationService } from "./configuration.service";

describe("ConfigurationService", () => {
  let httpMock: HttpTestingController;
  let brandingStub: jasmine.SpyObj<BrandingService>;
  let localeStub: jasmine.SpyObj<LocaleService>;
  let notificationsStub: jasmine.SpyObj<NotificationService>;

  const bootstrap: Bootstrap = {
    user: { id: "u1" } as never,
    company: { id: "c1" } as never,
    branding: { name: "Acme", primary_color: null, logo_url: null, locale: "fr", currency: "EUR", currency_symbol: "€" },
    role: { key: "admin", name: "Admin" },
    permissions: ["clients", "payments"],
    modules: ["clients"],
    roles: [{ id: "r1", key: "admin", name: "Admin", permissions: ["clients"], builtin: true }],
    permission_catalog: { clients: "Membres" },
    subscription: null,
    onboarding: null,
    features: {},
    notifications: { unread_count: 2 },
  };

  function buildService(): ConfigurationService {
    brandingStub = jasmine.createSpyObj<BrandingService>("BrandingService", ["apply"]);
    localeStub = jasmine.createSpyObj<LocaleService>("LocaleService", ["applyCompanyLocale"]);
    notificationsStub = jasmine.createSpyObj<NotificationService>("NotificationService", [
      "seedUnreadCount",
      "connect",
      "disconnect",
      "refresh",
    ]);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BrandingService, useValue: brandingStub },
        { provide: LocaleService, useValue: localeStub },
        { provide: NotificationService, useValue: notificationsStub },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(ConfigurationService);
  }

  afterEach(() => {
    localStorage.removeItem("fitora_bootstrap");
    httpMock?.verify();
  });

  it("starts with no cached state when localStorage is empty", () => {
    localStorage.removeItem("fitora_bootstrap");
    const config = buildService();
    expect(config.ready()).toBe(false);
    expect(config.company()).toBeNull();
    expect(config.permissions()).toEqual([]);
  });

  it("hydrates from a valid cache written by a previous session", () => {
    localStorage.setItem("fitora_bootstrap", JSON.stringify(bootstrap));
    const config = buildService();
    expect(config.ready()).toBe(true);
    expect(config.permissions()).toEqual(["clients", "payments"]);
  });

  it("rejects a stale cache missing permissions/modules arrays", () => {
    localStorage.setItem("fitora_bootstrap", JSON.stringify({ user: {}, company: {} }));
    const config = buildService();
    expect(config.ready()).toBe(false);
  });

  it("rejects corrupt JSON in the cache", () => {
    localStorage.setItem("fitora_bootstrap", "{not json");
    const config = buildService();
    expect(config.ready()).toBe(false);
  });

  it("load() GETs /bootstrap and populates every computed signal", () => {
    const config = buildService();
    let result: Bootstrap | undefined;
    config.load().subscribe((res) => (result = res));

    const req = httpMock.expectOne(`${API_BASE_URL}/bootstrap`);
    req.flush(bootstrap);

    expect(result).toEqual(bootstrap);
    expect(config.ready()).toBe(true);
    expect(config.company()).toEqual(bootstrap.company);
    expect(config.role()).toEqual({ key: "admin", name: "Admin" });
    expect(config.permissions()).toEqual(["clients", "payments"]);
    expect(config.modules()).toEqual(["clients"]);
    expect(config.roles()).toEqual(bootstrap.roles);
    expect(config.permissionCatalog()).toEqual({ clients: "Membres" });
    expect(JSON.parse(localStorage.getItem("fitora_bootstrap")!)).toEqual(bootstrap);
  });

  it("load() applies branding and the company locale when branding is present", () => {
    const config = buildService();
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(bootstrap);

    expect(brandingStub.apply).toHaveBeenCalledWith(bootstrap.branding!);
    expect(localeStub.applyCompanyLocale).toHaveBeenCalledWith("fr");
  });

  it("load() seeds the notification badge and opens the live feed", () => {
    const config = buildService();
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(bootstrap);

    expect(notificationsStub.seedUnreadCount).toHaveBeenCalledWith(2);
    expect(notificationsStub.connect).toHaveBeenCalled();
  });

  it("ensureLoaded() resolves the cached value once hydrated, without a new HTTP call", () => {
    const config = buildService();
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(bootstrap);

    let result: Bootstrap | null | undefined;
    config.ensureLoaded().subscribe((res) => (result = res));
    httpMock.expectNone(`${API_BASE_URL}/bootstrap`);
    expect(result).toEqual(bootstrap);
  });

  it("ensureLoaded() triggers a load when nothing has been hydrated yet", () => {
    const config = buildService();
    let result: Bootstrap | null | undefined;
    config.ensureLoaded().subscribe((res) => (result = res));

    const req = httpMock.expectOne(`${API_BASE_URL}/bootstrap`);
    req.flush(bootstrap);
    expect(result).toEqual(bootstrap);
  });

  it("ensureLoaded() resolves null (never errors) when the load fails", () => {
    const config = buildService();
    let result: Bootstrap | null | undefined = undefined;
    let errored = false;
    config.ensureLoaded().subscribe({ next: (res) => (result = res), error: () => (errored = true) });

    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).error(new ProgressEvent("error"));
    expect(errored).toBe(false);
    expect(result).toBeNull();
  });

  it("clear() resets state, cache, and disconnects notifications", () => {
    const config = buildService();
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(bootstrap);

    config.clear();

    expect(config.ready()).toBe(false);
    expect(localStorage.getItem("fitora_bootstrap")).toBeNull();
    expect(notificationsStub.disconnect).toHaveBeenCalled();
  });

  it("connectSuperadminNotifications connects and refreshes the feed", () => {
    const config = buildService();
    config.connectSuperadminNotifications();
    expect(notificationsStub.connect).toHaveBeenCalled();
    expect(notificationsStub.refresh).toHaveBeenCalled();
  });

  it("hasPermission checks membership in the current permissions list", () => {
    const config = buildService();
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(bootstrap);

    expect(config.hasPermission("clients")).toBe(true);
    expect(config.hasPermission("coaches")).toBe(false);
  });

  it("roleName returns the matching role's display name", () => {
    const config = buildService();
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(bootstrap);

    expect(config.roleName("admin")).toBe("Admin");
  });

  it("roleName falls back to a humanised key when no role matches", () => {
    const config = buildService();
    expect(config.roleName("coach")).toBe("Coach");
  });

  it("computed signals fall back to their defaults when the payload omits those fields", () => {
    const config = buildService();
    const sparse = { user: bootstrap.user, company: bootstrap.company, permissions: [], modules: undefined } as unknown as Bootstrap;
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(sparse);

    expect(config.role()).toBeNull();
    expect(config.modules()).toEqual([]);
    expect(config.roles()).toEqual([]);
    expect(config.permissionCatalog()).toEqual({});
    expect(config.subscription()).toBeNull();
    expect(config.onboarding()).toBeNull();
  });

  it("seeds the unread badge at 0 when the payload's notifications field is missing", () => {
    const config = buildService();
    const sparse = { ...bootstrap, notifications: undefined } as unknown as Bootstrap;
    config.load().subscribe();
    httpMock.expectOne(`${API_BASE_URL}/bootstrap`).flush(sparse);
    expect(notificationsStub.seedUnreadCount).toHaveBeenCalledWith(0);
  });
});
