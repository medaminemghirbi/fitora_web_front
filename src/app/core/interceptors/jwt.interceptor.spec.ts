import { HttpErrorResponse, HttpRequest } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { Observable, of, throwError } from "rxjs";
import { AuthService } from "../auth/auth.service";
import { jwtInterceptor } from "./jwt.interceptor";
import { activeCompany } from "../auth/active-company";

describe("jwtInterceptor", () => {
  let authStub: { getToken: jasmine.Spy; isAuthenticated: jasmine.Spy; logout: jasmine.Spy };
  let router: { navigate: jasmine.Spy; url: string };

  beforeEach(() => {
    authStub = {
      getToken: jasmine.createSpy().and.returnValue(null),
      isAuthenticated: jasmine.createSpy().and.returnValue(false),
      logout: jasmine.createSpy(),
    };
    router = { navigate: jasmine.createSpy(), url: "/admin/dashboard" };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: Router, useValue: router },
      ],
    });
  });

  function run(next: (req: HttpRequest<unknown>) => Observable<unknown>) {
    const req = new HttpRequest("GET", "/api/v1/clients");
    return TestBed.runInInjectionContext(() => jwtInterceptor(req, next as never));
  }

  it("passes the request through unmodified when there is no token", () => {
    let seen: HttpRequest<unknown> | undefined;
    run((req) => {
      seen = req;
      return of("ok");
    }).subscribe();

    expect(seen!.headers.has("Authorization")).toBe(false);
  });

  it("attaches a Bearer token when one is present", () => {
    authStub.getToken.and.returnValue("tok123");
    let seen: HttpRequest<unknown> | undefined;
    run((req) => {
      seen = req;
      return of("ok");
    }).subscribe();

    expect(seen!.headers.get("Authorization")).toBe("Bearer tok123");
  });

  it("passes a successful response through untouched", (done) => {
    run(() => of("ok")).subscribe((res) => {
      expect(res as unknown).toBe("ok");
      expect(authStub.logout).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      done();
    });
  });

  it("logs out and redirects to login on a 401 while a session is active", (done) => {
    const err = new HttpErrorResponse({ status: 401 });
    authStub.isAuthenticated.and.returnValue(true);

    run(() => throwError(() => err)).subscribe({
      error: (e) => {
        expect(e).toBe(err);
        expect(authStub.logout).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(["/connexion"]);
        done();
      },
    });
  });

  it("does not log out on a 401 when there is no active session (e.g. a failed login attempt)", (done) => {
    const err = new HttpErrorResponse({ status: 401 });
    authStub.isAuthenticated.and.returnValue(false);

    run(() => throwError(() => err)).subscribe({
      error: () => {
        expect(authStub.logout).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it("redirects to /trial-expired on the trial-lock signal", (done) => {
    const err = new HttpErrorResponse({ status: 402, error: { error: "trial_expired" } });

    run(() => throwError(() => err)).subscribe({
      error: () => {
        expect(router.navigate).toHaveBeenCalledWith(["/account-locked"]);
        done();
      },
    });
  });

  it("does not redirect again if already on /account-locked", (done) => {
    router.url = "/account-locked";
    const err = new HttpErrorResponse({ status: 402, error: { error: "trial_expired" } });

    run(() => throwError(() => err)).subscribe({
      error: () => {
        expect(router.navigate).not.toHaveBeenCalled();
        done();
      },
    });
  });

  // Whatever shut the door — an expired trial, a month unpaid, a suspension
  // — 402 means the same thing to whoever is looking at the screen.
  it("sends every lock reason to the same page", (done) => {
    const err = new HttpErrorResponse({ status: 402, error: { error: "payment_overdue" } });

    run(() => throwError(() => err)).subscribe({
      error: () => {
        expect(router.navigate).toHaveBeenCalledWith(["/account-locked"]);
        done();
      },
    });
  });

  it("re-throws any other error untouched", (done) => {
    const err = new HttpErrorResponse({ status: 500 });

    run(() => throwError(() => err)).subscribe({
      error: (e) => {
        expect(e).toBe(err);
        expect(authStub.logout).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
        done();
      },
    });
  });

  describe("X-Company-Id", () => {
    beforeEach(() => activeCompany.set(null));
    afterEach(() => activeCompany.set(null));

    function seenHeaders(): HttpRequest<unknown> {
      let seen: HttpRequest<unknown> | undefined;
      run((req) => {
        seen = req;
        return of("ok");
      }).subscribe();
      return seen!;
    }

    it("sends this tab's salle alongside the token", () => {
      authStub.getToken.and.returnValue("tok123");
      activeCompany.set("salle-2");

      expect(seenHeaders().headers.get("X-Company-Id")).toBe("salle-2");
    });

    it("sends no salle when the tab has none", () => {
      authStub.getToken.and.returnValue("tok123");

      expect(seenHeaders().headers.has("X-Company-Id")).toBe(false);
    });

    it("sends no salle without a token", () => {
      activeCompany.set("salle-2");

      expect(seenHeaders().headers.has("X-Company-Id")).toBe(false);
    });
  });
});
