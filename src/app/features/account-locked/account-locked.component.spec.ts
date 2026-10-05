import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { AuthService } from "../../core/auth/auth.service";
import { ConfigurationService } from "../../core/configuration/configuration.service";
import { AccountLockedComponent } from "./account-locked.component";

describe("AccountLockedComponent", () => {
  let fixture: ComponentFixture<AccountLockedComponent>;
  let component: AccountLockedComponent;
  let authStub: { logout: jasmine.Spy; currentUser: jasmine.Spy };

  function build(role = "admin", lockReason: string | null = "unpaid", trial = false): void {
    TestBed.resetTestingModule();
    authStub = {
      logout: jasmine.createSpy("logout"),
      currentUser: jasmine.createSpy("currentUser").and.returnValue({ role, email: "o@x.test" }),
    };

    TestBed.configureTestingModule({
      imports: [AccountLockedComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: ConfigurationService, useValue: { subscription: () => ({ lock_reason: lockReason, trial }) } },
      ],
    });

    fixture = TestBed.createComponent(AccountLockedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it("names which of the two reasons shut the door", () => {
    build("admin", "unpaid");
    expect(component.reason()).toBe("unpaid");

    build("admin", "suspended");
    expect(component.reason()).toBe("suspended");
  });

  it("words an ended trial as the end of the free days, not a missed payment", () => {
    build("admin", "unpaid", true);
    expect(component.trialOver()).toBeTrue();
    expect(component.copyKey()).toBe("trial_over");
    expect(fixture.nativeElement.querySelector("a[href]")!.textContent).toContain("locked.choose_plan");
  });

  it("keeps a suspension a suspension, trial or not", () => {
    build("admin", "suspended", true);
    expect(component.copyKey()).toBe("suspended");
  });

  it("falls back to suspended rather than showing nothing", () => {
    build("admin", null);
    expect(component.reason()).toBe("suspended");
  });

  // There is nothing to ask for any more: a gym settles with Fitora. What it
  // can still do is read what it owes, so that is the only link.
  it("sends the admin to their invoices, the one place that helps", () => {
    build("admin");
    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector("a[href]");
    expect(link?.getAttribute("href")).toBe("/admin/subscription");
  });

  it("gives staff no link at all — the money is not theirs to settle", () => {
    build("staff");
    expect(component.isAdmin()).toBe(false);
    expect(fixture.nativeElement.querySelector("a[href]")).toBeNull();
  });

  it("logout delegates to AuthService", () => {
    build();
    component.logout();
    expect(authStub.logout).toHaveBeenCalled();
  });
});
