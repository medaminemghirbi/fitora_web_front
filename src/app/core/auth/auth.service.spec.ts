import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { ConfigurationService } from "../configuration/configuration.service";
import { API_BASE_URL } from "../models/api-config";
import { Client } from "../models/client.model";
import { User } from "../models/user.model";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let configStub: {
    permissions: jasmine.Spy;
    role: jasmine.Spy;
    onboarding: jasmine.Spy;
    hasPermission: jasmine.Spy;
    load: jasmine.Spy;
    clear: jasmine.Spy;
    connectSuperadminNotifications: jasmine.Spy;
  };

  const admin: User = {
    id: "u1", first_name: "S", last_name: "O", full_name: "S O", email: "s@x.test", phone: null,
    role: "admin", locale: "fr", email_verified: true, company_id: "c1", staff_role: null,
 is_coach: false,
  };

  const memberClient: Client = {
    id: "cl1", first_name: "M", last_name: "C", full_name: "M C", email: "m@x.test", phone: null,
    active: true, login_enabled: false,
    joined_at: "2026-01-01",
    last_visit_at: null, current_contract: null,
  };

  function buildService(): AuthService {
    router = jasmine.createSpyObj<Router>("Router", ["navigate"]);
    configStub = {
      permissions: jasmine.createSpy().and.returnValue([]),
      role: jasmine.createSpy().and.returnValue(null),
      onboarding: jasmine.createSpy().and.returnValue(null),
      hasPermission: jasmine.createSpy().and.returnValue(false),
      load: jasmine.createSpy().and.returnValue({ subscribe: (o: { error?: () => void }) => o }),
      clear: jasmine.createSpy(),
      connectSuperadminNotifications: jasmine.createSpy(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: ConfigurationService, useValue: configStub },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  afterEach(() => {
    localStorage.clear();
    httpMock?.verify();
  });

  describe("hydration from localStorage", () => {
    it("starts unauthenticated with nothing stored", () => {
      localStorage.clear();
      const auth = buildService();
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.currentUser()).toBeNull();
    });

    it("restores the stored user on construction", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();
      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.currentUser()).toEqual(admin);
      expect(auth.isAdmin()).toBe(true);
      expect(auth.isSuperadmin()).toBe(false);
      expect(auth.isStaff()).toBe(false);
    });

    it("tolerates corrupt JSON in storage", () => {
      localStorage.setItem("fitora_user_v2", "{not json");
      const auth = buildService();
      expect(auth.currentUser()).toBeNull();
    });

    it("tolerates corrupt JSON in the impersonator stash", () => {
      localStorage.setItem("fitora_impersonator_v2", "{not json");
      const auth = buildService();
      expect(auth.isImpersonating()).toBe(false);
    });

    it("restores a stored member session", () => {
      localStorage.setItem("fitora_client", JSON.stringify(memberClient));
      const auth = buildService();

      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.isClient()).toBe(true);
      expect(auth.currentClient()).toEqual(memberClient);
      expect(auth.currentUser()).toBeNull();
    });

    // isAuthenticated() must never be true without somewhere to send them:
    // that combination once bounced people between the sign-in page and a
    // page needing a user until the app gave up painting.
    it("sends a member somewhere they can actually reach", () => {
      localStorage.setItem("fitora_client", JSON.stringify(memberClient));
      const auth = buildService();

      expect(auth.homeRouteForCurrentUser()).toBe("/member/home");
    });

    it("tolerates corrupt JSON in the stored member", () => {
      localStorage.setItem("fitora_client", "{not json");
      const auth = buildService();
      expect(auth.currentClient()).toBeNull();
    });
  });

  describe("login / register", () => {
    it("login POSTs credentials and stores the session", () => {
      const auth = buildService();
      let result: unknown;
      auth.login("s@x.test", "secret").subscribe((res) => (result = res));

      const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
      expect(req.request.method).toBe("POST");
      expect(req.request.body).toEqual({ email: "s@x.test", password: "secret" });
      req.flush({ token: "tok123", user: admin });

      expect(result).toEqual({ token: "tok123", user: admin });
      expect(auth.getToken()).toBe("tok123");
      expect(auth.currentUser()).toEqual(admin);
      expect(configStub.load).toHaveBeenCalled();
    });

    it("login stores a session for a user with no company_id (e.g. a platform superadmin)", () => {
      const auth = buildService();
      const superadmin: User = { ...admin, id: "superadmin1", role: "superadmin", company_id: null as unknown as string };
      auth.login("admin@x.test", "secret").subscribe();
      const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
      req.flush({ token: "superadmin-tok", user: superadmin });
      expect(auth.currentUser()).toEqual(superadmin);
    });

  });

  describe("hasPermission", () => {
    it("is false with no current user", () => {
      const auth = buildService();
      expect(auth.hasPermission("clients")).toBe(false);
    });

    it("is always true for a platform superadmin", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "superadmin" }));
      const auth = buildService();
      expect(auth.hasPermission("anything")).toBe(true);
      expect(configStub.hasPermission).not.toHaveBeenCalled();
    });

    it("delegates to ConfigurationService for anyone else", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();
      configStub.hasPermission.and.returnValue(true);
      expect(auth.hasPermission("payments")).toBe(true);
      expect(configStub.hasPermission).toHaveBeenCalledWith("payments");
    });
  });

  describe("logout", () => {
    it("clears the session and navigates to login", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      localStorage.setItem("fitora_token", "tok");
      const auth = buildService();

      auth.logout();

      expect(auth.currentUser()).toBeNull();
      expect(localStorage.getItem("fitora_token")).toBeNull();
      expect(configStub.clear).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(["/connexion"]);
    });

    it("exits impersonation instead of destroying the superadmin session", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      localStorage.setItem("fitora_token", "admin-tok");
      const superadmin: User = { ...admin, id: "superadmin1", role: "superadmin" };
      localStorage.setItem("fitora_impersonator_v2", JSON.stringify({ token: "superadmin-tok", user: superadmin, companyName: "Acme" }));
      const auth = buildService();

      expect(auth.isImpersonating()).toBe(true);

      auth.logout();

      // exitImpersonation restores the superadmin session rather than clearing it
      expect(auth.currentUser()).toEqual(superadmin);
      expect(auth.getToken()).toBe("superadmin-tok");
      expect(auth.isImpersonating()).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(["/superadmin/overview"]);
    });
  });

  describe("impersonation", () => {
    it("startImpersonation stashes the superadmin session and switches to the admin", () => {
      const superadmin: User = { ...admin, id: "superadmin1", role: "superadmin" };
      localStorage.setItem("fitora_user_v2", JSON.stringify(superadmin));
      localStorage.setItem("fitora_token", "superadmin-tok");
      const auth = buildService();

      auth.startImpersonation({ token: "admin-tok", user: admin }, "Acme Gym");

      expect(auth.isImpersonating()).toBe(true);
      expect(auth.impersonatedCompanyName()).toBe("Acme Gym");
      expect(auth.currentUser()).toEqual(admin);
      expect(auth.getToken()).toBe("admin-tok");
      expect(router.navigate).toHaveBeenCalledWith(["/admin/dashboard"]);
    });

    it("impersonatedCompanyName is null when not impersonating", () => {
      const auth = buildService();
      expect(auth.impersonatedCompanyName()).toBeNull();
    });

    it("exitImpersonation is a no-op when not impersonating", () => {
      const auth = buildService();
      auth.exitImpersonation();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe("homeRouteForCurrentUser", () => {
    it("sends a platform superadmin to /superadmin/companies", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "superadmin" }));
      const auth = buildService();
      expect(auth.homeRouteForCurrentUser()).toBe("/superadmin/overview");
    });

    it("sends a coach-kind staff login to /coach/today", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "staff", staff_role: "coach", is_coach: true }));
      const auth = buildService();
      expect(auth.homeRouteForCurrentUser()).toBe("/coach/today");
    });

    it("sends a fresh admin with unfinished setup into the onboarding flow", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();
      configStub.onboarding.and.returnValue({ complete: false, dismissed: false });
      expect(auth.homeRouteForCurrentUser()).toBe("/admin/onboarding");
    });

    it("sends an admin with dismissed/complete setup to the dashboard", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();
      configStub.onboarding.and.returnValue({ complete: false, dismissed: true });
      configStub.hasPermission.and.returnValue(true);
      expect(auth.homeRouteForCurrentUser()).toBe("/admin/dashboard");
    });

    // Nothing past sign-up opens until the address is confirmed.
    it("sends an admin who has not confirmed their address to the waiting screen", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, email_verified: false, company_id: null }));
      const auth = buildService();
      expect(auth.emailConfirmationPending()).toBe(true);
      expect(auth.homeRouteForCurrentUser()).toBe("/confirmation-email");
    });

    // Staff addresses were typed in by the gym; confirming stays optional.
    it("never holds staff back on an unconfirmed address", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "staff", staff_role: "moderator", email_verified: false }));
      const auth = buildService();
      expect(auth.emailConfirmationPending()).toBe(false);
      configStub.hasPermission.and.callFake((key: string) => key === "reports");
      expect(auth.homeRouteForCurrentUser()).toBe("/admin/dashboard");
    });

    it("defaults everyone who may read the dashboard to it", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "staff", staff_role: "moderator" }));
      const auth = buildService();
      configStub.hasPermission.and.callFake((key: string) => key === "reports");
      expect(auth.homeRouteForCurrentUser()).toBe("/admin/dashboard");
    });

    // A custom role without "reports" (a "Comptable" with payments only)
    // used to be sent to the dashboard, whose guard sent it "home" to the
    // dashboard again: the sign-in went nowhere. The schedule is open to all.
    it("lands a role without the dashboard permission on the schedule", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "staff", staff_role: "comptable" }));
      const auth = buildService();
      configStub.hasPermission.and.callFake((key: string) => key === "payments");
      expect(auth.homeRouteForCurrentUser()).toBe("/admin/calendar");
    });

    // The guards read isAuthenticated(); homeRouteForCurrentUser is only
    // ever asked once that is true, so a leftover member key must not make
    // it true. Covered in "throws away a member session left over".
  });

  it("coachShellApplies follows is_coach, not the role's name", () => {
    localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "staff", staff_role: "coach", is_coach: true }));
    const auth = buildService();
    expect(auth.coachShellApplies()).toBe(true);
  });

  describe("refreshCurrentUser", () => {
    it("GETs /auth/me and updates the stored user", () => {
      const auth = buildService();
      let result: User | undefined;
      auth.refreshCurrentUser().subscribe((u) => (result = u));

      const req = httpMock.expectOne(`${API_BASE_URL}/auth/me`);
      expect(req.request.method).toBe("GET");
      req.flush({ user: admin });

      expect(result).toEqual(admin);
      expect(auth.currentUser()).toEqual(admin);
      expect(JSON.parse(localStorage.getItem("fitora_user_v2")!)).toEqual(admin);
    });
  });

  describe("loadConfiguration", () => {
    it("clears config and opens the superadmin notification feed for a superadmin login", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify({ ...admin, role: "superadmin" }));
      const auth = buildService();

      auth.loadConfiguration();

      expect(configStub.clear).toHaveBeenCalled();
      expect(configStub.connectSuperadminNotifications).toHaveBeenCalled();
      expect(configStub.load).not.toHaveBeenCalled();
    });

    it("loads the bootstrap for anyone else", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();

      auth.loadConfiguration();

      expect(configStub.load).toHaveBeenCalled();
    });

    // The cached user is whatever login answered: a salle opened since
    // would never reach the navbar switcher without this.
    it("replaces the cached user with the live one the bootstrap carries", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();
      const live = { ...admin, companies: [
        { id: "c1", name: "One", logo_url: null, currency: "TND", active: false },
        { id: "c2", name: "Two", logo_url: null, currency: "TND", active: true },
      ] };
      configStub.load.and.returnValue({ subscribe: (o: { next?: (b: unknown) => void }) => o.next?.({ user: live }) });

      auth.loadConfiguration();

      expect(auth.currentUser()).toEqual(live);
      expect(JSON.parse(localStorage.getItem("fitora_user_v2")!)).toEqual(live);
    });

    it("keeps the cached user when the bootstrap answers for someone else", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();
      configStub.load.and.returnValue({ subscribe: (o: { next?: (b: unknown) => void }) => o.next?.({ user: { ...admin, id: "other" } }) });

      auth.loadConfiguration();

      expect(auth.currentUser()).toEqual(admin);
    });

    it("swallows a bootstrap load failure", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      const auth = buildService();
      configStub.load.and.returnValue({ subscribe: (o: { error?: () => void }) => o.error?.() });

      expect(() => auth.loadConfiguration()).not.toThrow();
    });
  });

  it("getToken reads the stored JWT", () => {
    localStorage.setItem("fitora_token", "abc");
    const auth = buildService();
    expect(auth.getToken()).toBe("abc");
  });

  describe("changing the password", () => {
    it("keeps this device signed in with the fresh token the API returns", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      localStorage.setItem("fitora_token", "old-token");
      const auth = buildService();

      auth.changePassword("old-password", "new-password-1").subscribe();
      const req = httpMock.expectOne(`${API_BASE_URL}/auth/password`);
      expect(req.request.method).toBe("PATCH");
      expect(req.request.body).toEqual({ current_password: "old-password", password: "new-password-1" });
      req.flush({ token: "new-token" });

      expect(auth.getToken()).toBe("new-token");
    });

    it("signs out of every device, this one included", () => {
      localStorage.setItem("fitora_user_v2", JSON.stringify(admin));
      localStorage.setItem("fitora_token", "tok");
      const auth = buildService();

      auth.signOutEverywhere().subscribe();
      const req = httpMock.expectOne(`${API_BASE_URL}/auth/logout`);
      expect(req.request.body).toEqual({ all_devices: true });
      req.flush(null);

      expect(auth.getToken()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(["/connexion"]);
    });
  });

  describe("a session cached before the role rename", () => {
    it("is dropped, token and all, rather than read with the new meaning of its role", () => {
      localStorage.setItem("gymly_user", JSON.stringify({ ...admin, role: "admin" }));
      localStorage.setItem("fitora_token", "tok");

      const auth = buildService();

      expect(auth.currentUser()).toBeNull();
      expect(localStorage.getItem("gymly_user")).toBeNull();
      expect(auth.getToken()).toBeNull();
    });
  });
});
