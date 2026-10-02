import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { Component } from "@angular/core";
import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { AuthService } from "../../core/auth/auth.service";
import { NavGroup, NavLeaf } from "../../core/configuration/navigation.service";
import { CompanyService } from "../../core/services/company.service";
import { NavbarComponent } from "./navbar.component";

@Component({ standalone: true, template: "" })
class BlankComponent {}

describe("NavbarComponent", () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let component: NavbarComponent;
  let authStub: { currentUser: jasmine.Spy; logout: jasmine.Spy };
  let companyServiceStub: { switchTo: jasmine.Spy };

  const dashboardItem: NavLeaf = { path: "/admin/dashboard", icon: "bi-house", labelKey: "nav.dashboard" };
  const groups: NavGroup[] = [
    {
      id: "sales",
      labelKey: "nav.sales",
      icon: "bi-people",
      items: [
        { path: "/admin/clients", icon: "bi-people", labelKey: "nav.clients" },
        { path: "/admin/payments", icon: "bi-cash", labelKey: "nav.payments" },
      ],
    },
  ];

  beforeEach(async () => {
    authStub = { currentUser: jasmine.createSpy().and.returnValue({ role: "admin" }), logout: jasmine.createSpy() };
    companyServiceStub = { switchTo: jasmine.createSpy().and.returnValue(of({ company: {} })) };

    await TestBed.configureTestingModule({
      imports: [NavbarComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: "**", component: BlankComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub },
        { provide: CompanyService, useValue: companyServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    component.dashboardItem = dashboardItem;
    component.groups = groups;
    fixture.detectChanges();
  });

  it("toggleGroup opens a group and closes the user menu", () => {
    component.userMenuOpen.set(true);
    component.toggleGroup("sales");
    expect(component.openGroup()).toBe("sales");
    expect(component.userMenuOpen()).toBe(false);
  });

  it("toggleGroup on an already-open group closes it", () => {
    component.toggleGroup("sales");
    component.toggleGroup("sales");
    expect(component.openGroup()).toBeNull();
  });

  it("logout delegates to AuthService", () => {
    component.logout();
    expect(authStub.logout).toHaveBeenCalled();
  });

  it("onDocClick closes menus when the click lands outside the nav menu", () => {
    component.toggleGroup("sales");
    component.onDocClick({ target: document.body } as unknown as MouseEvent);
    expect(component.openGroup()).toBeNull();
  });

  it("onDocClick leaves menus open when the click lands inside the nav menu", () => {
    const menuEl = document.createElement("div");
    menuEl.className = "app-navbar-menu";
    document.body.appendChild(menuEl);
    component.toggleGroup("sales");

    component.onDocClick({ target: menuEl } as unknown as MouseEvent);

    expect(component.openGroup()).toBe("sales");
    menuEl.remove();
  });

  it("Escape closes every menu, including the mobile menu", () => {
    component.toggleGroup("sales");
    component.userMenuOpen.set(true);
    component.mobileOpen.set(true);

    component.onEsc();

    expect(component.openGroup()).toBeNull();
    expect(component.userMenuOpen()).toBe(false);
    expect(component.mobileOpen()).toBe(false);
  });

  it("activeGroupId reflects the group owning the current route", () => {
    (component as unknown as { activeUrl: { set: (v: string) => void } })["activeUrl"].set("/admin/payments");
    expect(component.activeGroupId()).toBe("sales");
  });

  it("activePageLabel works with no dashboardItem set", () => {
    const fresh = TestBed.createComponent(NavbarComponent);
    fresh.componentInstance.groups = groups;
    fresh.detectChanges();
    (fresh.componentInstance as unknown as { activeUrl: { set: (v: string) => void } })["activeUrl"].set("/admin/payments");
    expect(fresh.componentInstance.activePageLabel()).toBe("nav.payments");
  });

  it("activePageLabel finds the longest matching path across every nav source", () => {
    component.flatItems = [{ path: "/admin", icon: "bi-house", labelKey: "nav.root" }];
    (component as unknown as { activeUrl: { set: (v: string) => void } })["activeUrl"].set("/admin/payments");
    expect(component.activePageLabel()).toBe("nav.payments");
  });

  it("activePageLabel is null when nothing matches the current route", () => {
    (component as unknown as { activeUrl: { set: (v: string) => void } })["activeUrl"].set("/somewhere/else");
    expect(component.activePageLabel()).toBeNull();
  });

  it("activePageLabel picks the longest of several matching paths", () => {
    // allLeaves() reads plain @Input properties (not signals) — it's only
    // ever (re)computed the first time something reads it, so every input
    // must be set before the very first detectChanges()/computed read.
    const fresh = TestBed.createComponent(NavbarComponent);
    fresh.componentInstance.dashboardItem = dashboardItem;
    fresh.componentInstance.groups = groups;
    fresh.componentInstance.flatItems = [
      { path: "/admin", icon: "bi-house", labelKey: "nav.root" },
      { path: "/admin/clients/4", icon: "bi-people", labelKey: "nav.clients_section" },
    ];
    fresh.detectChanges();

    (fresh.componentInstance as unknown as { activeUrl: { set: (v: string) => void } })["activeUrl"].set("/admin/clients/42");
    expect(fresh.componentInstance.activePageLabel()).toBe("nav.clients_section");
  });

  it("a real NavigationEnd event updates the active URL and closes every menu", fakeAsync(() => {
    const router = TestBed.inject(Router);
    component.toggleGroup("sales");
    component.mobileOpen.set(true);

    router.navigateByUrl("/admin/payments");
    tick();
    fixture.detectChanges();

    expect(component.activeGroupId()).toBe("sales");
    expect(component.openGroup()).toBeNull();
    expect(component.mobileOpen()).toBe(false);
  }));

  describe("company switcher", () => {
    const companies = [
      { id: "co-1", name: "Gym One", logo_url: null, currency: "TND", active: true },
      { id: "co-2", name: "Gym Two", logo_url: null, currency: "TND", active: false },
    ];

    // switchableCompanies/activeCompany are computed() signals — they only
    // re-run when a tracked Signal dependency changes. authStub.currentUser
    // is a plain jasmine spy, not a real Signal, so changing its return
    // value on the shared component (already read once in the outer
    // beforeEach) wouldn't be picked up. A fresh component per test, with
    // the stub set before its first read, sidesteps that entirely.
    function freshWith(user: Record<string, unknown>): NavbarComponent {
      authStub.currentUser.and.returnValue(user);
      const fresh = TestBed.createComponent(NavbarComponent);
      fresh.componentInstance.groups = groups;
      fresh.detectChanges();
      return fresh.componentInstance;
    }

    // The switcher is also an admin's way to "Mes salles", where another
    // salle is opened — so one salle is enough to show it.
    it("switchableCompanies shows an admin's only salle", () => {
      expect(freshWith({ role: "admin", companies: [companies[0]] }).switchableCompanies()).toEqual([companies[0]]);
    });

    it("switchableCompanies shows a moderator's salles only once there is more than one", () => {
      expect(freshWith({ role: "staff", companies: [companies[0]] }).switchableCompanies()).toBeNull();
      expect(freshWith({ role: "staff", companies }).switchableCompanies()).toEqual(companies);
    });

    it("switchableCompanies is null when there's no companies field at all (staff/superadmin)", () => {
      expect(freshWith({ role: "staff" }).switchableCompanies()).toBeNull();
    });

    it("switchableCompanies lists every company once there's more than one, and activeCompany picks the flagged one", () => {
      const withCompanies = freshWith({ role: "admin", companies });
      expect(withCompanies.switchableCompanies()).toEqual(companies);
      expect(withCompanies.activeCompany()?.id).toBe("co-1");
    });

    it("toggleCompanySwitcher opens it and closes the group/user menus", () => {
      component.openGroup.set("sales");
      component.userMenuOpen.set(true);

      component.toggleCompanySwitcher();

      expect(component.companySwitcherOpen()).toBe(true);
      expect(component.openGroup()).toBeNull();
      expect(component.userMenuOpen()).toBe(false);
    });

    it("toggleCompanySwitcher twice closes it again", () => {
      component.toggleCompanySwitcher();
      component.toggleCompanySwitcher();
      expect(component.companySwitcherOpen()).toBe(false);
    });

    it("switchCompany does nothing but close the menu when picking the already-active company", () => {
      const admin = freshWith({ role: "admin", companies });
      admin.companySwitcherOpen.set(true);

      admin.switchCompany("co-1");

      expect(companyServiceStub.switchTo).not.toHaveBeenCalled();
      expect(admin.companySwitcherOpen()).toBe(false);
    });

    it("switchCompany calls the service and reloads to the dashboard on success", () => {
      const admin = freshWith({ role: "admin", companies });
      const reload = spyOn(admin as unknown as { reloadToHome(): void }, "reloadToHome");

      admin.switchCompany("co-2");

      expect(companyServiceStub.switchTo).toHaveBeenCalledWith("co-2");
      expect(reload).toHaveBeenCalled();
    });

    it("switchCompany resets state and stops spinning on failure", () => {
      const admin = freshWith({ role: "admin", companies });
      companyServiceStub.switchTo.and.returnValue(throwError(() => new Error("nope")));
      admin.companySwitcherOpen.set(true);

      admin.switchCompany("co-2");

      expect(admin.switching()).toBe(false);
      expect(admin.companySwitcherOpen()).toBe(false);
    });

    it("switchCompany ignores a second click while already switching", () => {
      const admin = freshWith({ role: "admin", companies });
      admin.switching.set(true);

      admin.switchCompany("co-2");

      expect(companyServiceStub.switchTo).not.toHaveBeenCalled();
    });
  });

  it("shows a group holding a single entry as a direct link, not a dropdown", () => {
    component.groups = [
      { id: "team", labelKey: "nav.team", icon: "bi-person-vcard", items: [{ path: "/admin/team", icon: "bi-person-vcard", labelKey: "nav.team" }] },
    ];
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="/admin/team"]')).toBeTruthy();
    expect(el.querySelector(".app-navbar-group")).toBeNull();
  });

  it("keeps the dropdown for a group with more than one entry", () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(".app-navbar-group")).toBeTruthy();
  });

  describe("getting out of the way", () => {
    /** The listener coalesces into one rAF; drive it and wait for the frame. */
    async function scrollTo(y: number): Promise<void> {
      Object.defineProperty(window, "scrollY", { value: y, configurable: true });
      component.onWindowScroll();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      fixture.detectChanges();
    }

    it("starts visible", () => {
      expect(component.hidden()).toBe(false);
    });

    it("slides away on the way down", async () => {
      await scrollTo(400);
      await scrollTo(700);

      expect(component.hidden()).toBe(true);
      expect(fixture.nativeElement.querySelector(".app-navbar").classList).toContain("is-hidden");
    });

    it("comes straight back on the first scroll up", async () => {
      await scrollTo(400);
      await scrollTo(700);
      await scrollTo(650);

      expect(component.hidden()).toBe(false);
    });

    // Otherwise a short page or an over-scroll bounce could leave the bar
    // parked off screen with no way to ask for it back.
    it("always shows near the top, whatever the direction", async () => {
      await scrollTo(400);
      await scrollTo(700);
      await scrollTo(0);
      await scrollTo(40);

      expect(component.hidden()).toBe(false);
    });

    // A menu belongs to a bar you can still see.
    it("stays put while one of its menus is open", async () => {
      component.userMenuOpen.set(true);

      await scrollTo(400);
      await scrollTo(700);

      expect(component.hidden()).toBe(false);
    });

    it("coalesces a burst of scroll events into one frame", async () => {
      Object.defineProperty(window, "scrollY", { value: 600, configurable: true });
      for (let i = 0; i < 20; i++) component.onWindowScroll();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      expect(component.hidden()).toBe(true);
    });
  });
});
