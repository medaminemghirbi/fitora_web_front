import { HttpErrorResponse } from "@angular/common/http";
import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { AccountRecoveryService } from "../../core/auth/account-recovery.service";
import { AuthService } from "../../core/auth/auth.service";
import { CONTINUE_DELAY_MS } from "./confirm-email.component";
import { VerifyEmailComponent } from "./verify-email.component";

describe("VerifyEmailComponent", () => {
  let fixture: ComponentFixture<VerifyEmailComponent>;
  let component: VerifyEmailComponent;
  let recovery: jasmine.SpyObj<AccountRecoveryService>;
  let router: Router;
  let authStub: {
    isAuthenticated: jasmine.Spy;
    currentUser: jasmine.Spy;
    homeRouteForCurrentUser: jasmine.Spy;
    refreshCurrentUser: jasmine.Spy;
  };

  const confirmedAdmin = { role: "admin", email_verified: true, company_id: null };

  function build(token: string | null, signedIn = false): void {
    TestBed.resetTestingModule();
    recovery = jasmine.createSpyObj<AccountRecoveryService>("AccountRecoveryService", ["verifyEmail"]);
    authStub = {
      isAuthenticated: jasmine.createSpy().and.returnValue(signedIn),
      currentUser: jasmine.createSpy().and.returnValue(signedIn ? confirmedAdmin : null),
      homeRouteForCurrentUser: jasmine.createSpy().and.returnValue("/admin/dashboard"),
      refreshCurrentUser: jasmine.createSpy().and.returnValue(of(confirmedAdmin)),
    };

    TestBed.configureTestingModule({
      imports: [VerifyEmailComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AccountRecoveryService, useValue: recovery },
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
        },
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, "navigateByUrl").and.resolveTo(true);
    fixture = TestBed.createComponent(VerifyEmailComponent);
    component = fixture.componentInstance;
  }

  it("errors immediately when there is no token", () => {
    build(null);
    fixture.detectChanges();
    expect(component.status()).toBe("error");
    expect(component.stage()).toBe("error");
    expect(component.error()).toBe("auth.verify_email_invalid_link");
    expect(recovery.verifyEmail).not.toHaveBeenCalled();
  });

  it("verifies the token and draws the check", () => {
    build("tok123");
    recovery.verifyEmail.and.returnValue(of(undefined));
    fixture.detectChanges();
    expect(recovery.verifyEmail).toHaveBeenCalledWith("tok123");
    expect(component.status()).toBe("success");
    expect(component.stage()).toBe("confirmed");
  });

  it("tells the waiting screen in another tab at once", () => {
    const posted: unknown[] = [];
    const listener = new BroadcastChannel("fitora-auth");
    spyOn(BroadcastChannel.prototype, "postMessage").and.callFake((m: unknown) => posted.push(m));

    build("tok123");
    recovery.verifyEmail.and.returnValue(of(undefined));
    fixture.detectChanges();

    expect(posted).toEqual([{ type: "email-verified" }]);
    listener.close();
  });

  // Signed in on this browser: the page moves on to naming the gym by itself,
  // once the cached user says "confirmed" — or the guards would bounce back.
  it("refreshes the cached user, then moves on to naming the gym by itself", fakeAsync(() => {
    build("tok123", true);
    recovery.verifyEmail.and.returnValue(of(undefined));
    fixture.detectChanges();

    expect(authStub.refreshCurrentUser).toHaveBeenCalled();
    expect(component.continuing()).toBe(true);

    tick(CONTINUE_DELAY_MS);
    expect(router.navigateByUrl).toHaveBeenCalledWith("/admin/setup-company");
  }));

  it("sends a signed-in admin who already has a gym home", () => {
    build("tok123", true);
    authStub.currentUser.and.returnValue({ ...confirmedAdmin, company_id: "c1" });
    recovery.verifyEmail.and.returnValue(of(undefined));
    fixture.detectChanges();
    expect(component.continueUrl()).toBe("/admin/dashboard");
    fixture.destroy();
  });

  it("sends a visitor from another device to sign in, and does not refresh anyone", () => {
    build("tok123");
    recovery.verifyEmail.and.returnValue(of(undefined));
    fixture.detectChanges();
    expect(component.continueUrl()).toBe("/connexion");
    expect(authStub.refreshCurrentUser).not.toHaveBeenCalled();
  });

  it("shows the invalid-link error when verification fails for a visitor", () => {
    build("tok123");
    recovery.verifyEmail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 422 })));
    fixture.detectChanges();
    expect(component.status()).toBe("error");
    expect(component.error()).toBe("auth.verify_email_invalid_link");
  });

  // Confirming spends the token: a second click on the same link is refused
  // by the server, but for an address that IS confirmed that is no failure.
  it("treats a second click as success when the address is already confirmed", fakeAsync(() => {
    build("tok123", true);
    recovery.verifyEmail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 422 })));
    fixture.detectChanges();

    expect(component.status()).toBe("success");
    tick(CONTINUE_DELAY_MS);
    expect(router.navigateByUrl).toHaveBeenCalled();
  }));

  it("still fails a stale link for an admin whose address is not confirmed", () => {
    build("tok123", true);
    authStub.refreshCurrentUser.and.returnValue(of({ ...confirmedAdmin, email_verified: false }));
    recovery.verifyEmail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 422 })));
    fixture.detectChanges();
    expect(component.status()).toBe("error");
  });
});
