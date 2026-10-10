import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { AccountRecoveryService } from "../../core/auth/account-recovery.service";
import { AuthService } from "../../core/auth/auth.service";
import { ConfigurationService } from "../../core/configuration/configuration.service";
import { AppVersionService } from "../../core/services/app-version.service";
import { BrandingService } from "../../core/services/branding.service";
import { AdminShellComponent } from "./admin-shell.component";

describe("AdminShellComponent", () => {
  let fixture: ComponentFixture<AdminShellComponent>;
  let component: AdminShellComponent;
  let authStub: {
    currentUser: jasmine.Spy;
    isImpersonating: jasmine.Spy;
    impersonatedCompanyName: jasmine.Spy;
    exitImpersonation: jasmine.Spy;
    loadConfiguration: jasmine.Spy;
    hasPermission: jasmine.Spy;
    hasFeature: jasmine.Spy;
  };
  let configStub: jasmine.SpyObj<ConfigurationService>;
  let recoveryStub: jasmine.SpyObj<AccountRecoveryService>;

  function build(currentUser: unknown, ready = true, version: string | null = null): void {
    authStub = {
      currentUser: jasmine.createSpy().and.returnValue(currentUser),
      isImpersonating: jasmine.createSpy().and.returnValue(false),
      impersonatedCompanyName: jasmine.createSpy().and.returnValue(null),
      exitImpersonation: jasmine.createSpy(),
      loadConfiguration: jasmine.createSpy(),
      hasPermission: jasmine.createSpy().and.returnValue(true),
      hasFeature: jasmine.createSpy().and.returnValue(false),
    };
    configStub = jasmine.createSpyObj<ConfigurationService>("ConfigurationService", ["ready", "subscription", "proFeatures"]);
    configStub.ready.and.returnValue(ready);
    configStub.subscription.and.returnValue(null);
    configStub.proFeatures.and.returnValue(true);
    recoveryStub = jasmine.createSpyObj<AccountRecoveryService>("AccountRecoveryService", ["resendVerification"]);

    TestBed.configureTestingModule({
      imports: [AdminShellComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub },
        { provide: ConfigurationService, useValue: configStub },
        { provide: AccountRecoveryService, useValue: recoveryStub },
        {
          provide: BrandingService,
          useValue: {
            ...jasmine.createSpyObj<BrandingService>("BrandingService", ["logoUrl", "load"]),
            // The rail names the gym you are in, so it reads the signal too.
            branding: signal(null),
          },
        },
        { provide: AppVersionService, useValue: { current: () => version, load: jasmine.createSpy() } },
      ],
    });
  }

  const admin = { role: "admin", email_verified: true };

  it("triggers loadConfiguration when the bootstrap hasn't resolved yet", () => {
    build(admin, false);
    fixture = TestBed.createComponent(AdminShellComponent);
    fixture.detectChanges();
    expect(authStub.loadConfiguration).toHaveBeenCalled();
  });

  it("does not reload configuration once it's already ready", () => {
    build(admin, true);
    fixture = TestBed.createComponent(AdminShellComponent);
    fixture.detectChanges();
    expect(authStub.loadConfiguration).not.toHaveBeenCalled();
  });

  describe("once constructed", () => {
    beforeEach(() => {
      build(admin, true);
      fixture = TestBed.createComponent(AdminShellComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it("showAdminOnlySections is true for an admin", () => {
      expect(component.showAdminOnlySections()).toBe(true);
    });

    it("emailUnverified reflects the current user's verification state", () => {
      expect(component.emailUnverified()).toBe(false);
    });

    it("says nothing about settling when there is no subscription at all", () => {
      expect(component.daysToSettle()).toBeNull();
    });

    it("resendVerificationEmail flips the loading/success flags on success", () => {
      recoveryStub.resendVerification.and.returnValue(of({}) as never);
      component.resendVerificationEmail();
      expect(component.resendingVerification()).toBe(false);
      expect(component.verificationResent()).toBe(true);
    });

    it("resendVerificationEmail clears the loading flag on error", () => {
      recoveryStub.resendVerification.and.returnValue(throwError(() => new Error("nope")));
      component.resendVerificationEmail();
      expect(component.resendingVerification()).toBe(false);
      expect(component.verificationResent()).toBe(false);
    });
  });

  it("showAdminOnlySections is false for a staff login", () => {
    build({ role: "staff", email_verified: true }, true);
    fixture = TestBed.createComponent(AdminShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.showAdminOnlySections()).toBe(false);
  });

  it("versionSuffix is null with no app version loaded yet", () => {
    build(admin, true);
    fixture = TestBed.createComponent(AdminShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.versionSuffix()).toBeNull();
  });

  it("versionSuffix formats the loaded app version", () => {
    build(admin, true, "1.2.3");
    fixture = TestBed.createComponent(AdminShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.versionSuffix()).toBe("v1.2.3");
  });

  // The admin should see the door closing, not find it shut mid-task.
  describe("the month that has not been settled", () => {
    // The stub is a spy, not a signal, so a computed that already read it
    // would keep its first answer — the component is rebuilt each time.
    function withSubscription(patch: Record<string, unknown>): void {
      build(admin, true);
      configStub.subscription.and.returnValue({
        active: true,
        locked: false,
        current_period_paid: true,
        days_before_lock: null,
        lock_reason: null,
        trial: false,
        trial_days_left: null,
        plan: "starter",
        member_app: false,
        multi_salle: false, pro_features: false,
        ...patch,
      });
      fixture = TestBed.createComponent(AdminShellComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    }

    it("says nothing while the month is settled", () => {
      withSubscription({});
      expect(component.daysToSettle()).toBeNull();
    });

    it("counts down once the paid period has run out", () => {
      withSubscription({ current_period_paid: false, days_before_lock: 2 });
      expect(component.daysToSettle()).toBe(2);
    });

    it("says zero on the last day rather than falling silent", () => {
      withSubscription({ current_period_paid: false, days_before_lock: 0 });
      expect(component.daysToSettle()).toBe(0);
    });

    // The free days count down on their own banner, not as a debt.
    it("stays out of the way of an ended trial", () => {
      withSubscription({ current_period_paid: false, days_before_lock: 0, trial: true, trial_days_left: 0 });
      expect(component.daysToSettle()).toBeNull();
    });

    it("counts the free days down while the trial runs", () => {
      withSubscription({ trial: true, trial_days_left: 9 });
      expect(component.trialDaysLeft()).toBe(9);
    });

    it("says zero on the trial's last evening, before the door shuts", () => {
      withSubscription({ current_period_paid: false, days_before_lock: 0, trial: true, trial_days_left: 0 });
      expect(component.trialDaysLeft()).toBe(0);
    });

    it("has no trial banner once a paid period follows", () => {
      withSubscription({});
      expect(component.trialDaysLeft()).toBeNull();
    });
  });
});

