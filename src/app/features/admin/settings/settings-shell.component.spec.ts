import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { ReplaySubject } from "rxjs";
import { AuthService } from "../../../core/auth/auth.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { SettingsShellComponent } from "./settings-shell.component";

describe("SettingsShellComponent", () => {
  let fixture: ComponentFixture<SettingsShellComponent>;
  let component: SettingsShellComponent;
  let router: Router;
  let paramMap$: ReplaySubject<ReturnType<typeof convertToParamMap>>;

  /** starter: the account is on Starter — Pro's tools are locked. */
  function build(role: string, section: string | null, starter = false) {
    TestBed.resetTestingModule();
    paramMap$ = new ReplaySubject(1);
    paramMap$.next(convertToParamMap(section ? { section } : {}));

    TestBed.configureTestingModule({
      imports: [SettingsShellComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => ({ role, staff_role: null }),
 is_coach: false, hasPermission: () => true } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: paramMap$, snapshot: { queryParamMap: convertToParamMap({}), paramMap: convertToParamMap({}) } },
        },
        ...(starter ? [{ provide: ConfigurationService, useValue: { proFeatures: signal(false) } }] : []),
      ],
    });

    // Installed before createComponent(): the shell's redirect (for an
    // unknown/missing section) fires from its constructor, synchronously,
    // before fixture.detectChanges() would otherwise run.
    router = TestBed.inject(Router);
    spyOn(router, "navigate");
    fixture = TestBed.createComponent(SettingsShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it("isAdmin is true for an admin login", () => {
    build("admin", "company");
    expect(component.isAdmin).toBe(true);
  });

  it("isAdmin is false for a staff login", () => {
    build("staff", "activities");
    expect(component.isAdmin).toBe(false);
  });

  describe("on Starter", () => {
    it("keeps the Pro tools off the tab row and lists them, locked, behind \"Outils Pro\"", () => {
      build("admin", "company", true);
      const el = fixture.nativeElement as HTMLElement;
      const tabs = Array.from(el.querySelectorAll(".settings-tab")).map((t) => t.getAttribute("href"));
      expect(tabs).not.toContain("/admin/settings/branding");
      expect(tabs).toContain("/admin/settings/contracts");

      (el.querySelector(".settings-pro-btn") as HTMLButtonElement).click();
      fixture.detectChanges();

      const items = Array.from(el.querySelectorAll(".settings-pro-item")).map((t) => t.getAttribute("href"));
      expect(items).toEqual(["/admin/settings/branding", "/admin/settings/data-exchange", "/admin/settings/mobile-app", "/admin/settings/roles"]);
      expect(el.querySelectorAll(".settings-pro-lock").length).toBe(4);
      expect(el.querySelector(".settings-pro-cta")).not.toBeNull();
    });

    it("shows the mobile app's keys locked", () => {
      build("admin", "mobile-app", true);

      expect(fixture.nativeElement.querySelector("app-pro-lock")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("app-settings-mobile-app")).toBeNull();
    });

    it("closes the menu on Escape", () => {
      build("admin", "company", true);
      component.proMenuOpen.set(true);
      component.onEscape();
      expect(component.proMenuOpen()).toBeFalse();
    });

    it("locks the whole Image de marque tab, and keeps Contrats & signature open", () => {
      build("admin", "branding", true);
      expect(fixture.nativeElement.querySelector("app-pro-lock")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("app-settings-branding")).toBeNull();

      build("admin", "contracts", true);
      expect(fixture.nativeElement.querySelector("app-pro-lock")).toBeNull();
      expect(fixture.nativeElement.querySelector("app-settings-branding")).not.toBeNull();
    });

    it("shows import / export locked instead of the tool", () => {
      build("admin", "data-exchange", true);

      expect(fixture.nativeElement.querySelector("app-pro-lock")).not.toBeNull();
      expect(fixture.nativeElement.querySelector("app-data-exchange")).toBeNull();
    });
  });

  it("redirects to the first known section when the URL section is unknown", () => {
    build("admin", "not-a-real-section");
    expect(router.navigate).toHaveBeenCalledWith(["/admin/settings", "company"], { replaceUrl: true });
  });

  it("sets the active section when the URL section is known", () => {
    build("admin", "branding");
    expect(component.activeSection()?.path).toBe("branding");
  });

  it("redirects to the first section when none is given", () => {
    build("admin", null);
    expect(router.navigate).toHaveBeenCalledWith(["/admin/settings", "company"], { replaceUrl: true });
  });

  it("goto navigates to the given section", () => {
    build("admin", "company");
    component.goto("branding");
    expect(router.navigate).toHaveBeenCalledWith(["/admin/settings", "branding"]);
  });

  it("goto does nothing for an empty path", () => {
    build("admin", "company");
    (router.navigate as jasmine.Spy).calls.reset();
    component.goto("");
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("puts every everyday section on the tab row, active one marked for a screen reader too", () => {
    build("admin", "company");

    const tabs = [...fixture.nativeElement.querySelectorAll(".settings-tab")] as HTMLElement[];

    // The Pro tools live behind their own menu; "Premiers pas" is a header button.
    expect(tabs.length).toBe(component.coreSections().length);
    expect(component.coreSections().length + component.proSections().length).toBe(component.flatSections().length);
    expect(fixture.nativeElement.querySelector(".settings-start")).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.settings-tab[aria-current="page"]').length).toBe(1);
  });

  it("offers the same sections as a picker where the row will not fit", () => {
    build("admin", "company");

    const options = [...fixture.nativeElement.querySelectorAll(".settings-picker option")] as HTMLOptionElement[];

    expect(options.map((o) => o.value)).toEqual(component.flatSections().map((s) => s.path));
  });

  it("navGroups always includes the appearance group, visible to any role", () => {
    build("staff", "appearance");
    expect(component.navGroups().some((g) => g.key === "appearance")).toBe(true);
  });
});
