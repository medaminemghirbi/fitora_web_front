import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { AuthService } from "../../core/auth/auth.service";
import { Client } from "../../core/models/client.model";
import { BrandingService } from "../../core/services/branding.service";
import { ClientsService } from "../../core/services/clients.service";
import { CompanyService } from "../../core/services/company.service";
import { ThemeService } from "../../core/services/theme.service";
import { DeskShellComponent } from "./desk-shell.component";

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    first_name: "Ahmed",
    last_name: "Ben Ali",
    full_name: "Ahmed Ben Ali",
    email: null,
    phone: null,
    active: true,
    login_enabled: false,
    joined_at: "2026-01-01T00:00:00Z",
    last_visit_at: null,
    current_contract: null,
    ...overrides,
  };
}

describe("DeskShellComponent", () => {
  let fixture: ComponentFixture<DeskShellComponent>;
  let component: DeskShellComponent;
  let clients: jasmine.SpyObj<ClientsService>;
  let companies: jasmine.SpyObj<CompanyService>;
  let currentUser: jasmine.Spy;

  beforeEach(async () => {
    companies = jasmine.createSpyObj<CompanyService>("CompanyService", ["switchTo"]);
    companies.switchTo.and.returnValue(of({ company: {} }) as never);
    currentUser = jasmine.createSpy("currentUser").and.returnValue({ full_name: "Desk", email: "desk@gymly.test" });

    clients = jasmine.createSpyObj<ClientsService>("ClientsService", ["list"]);
    clients.list.and.returnValue(of({ clients: [client()], meta: { page: 1, per_page: 6, total: 1, total_pages: 1 }, counts: {} }) as never);

    await TestBed.configureTestingModule({
      imports: [DeskShellComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: ClientsService, useValue: clients },
        { provide: CompanyService, useValue: companies },
        { provide: BrandingService, useValue: { load: () => undefined, logoUrl: () => null } },
        { provide: ThemeService, useValue: { theme: () => "light", toggle: () => undefined } },
        {
          provide: AuthService,
          useValue: { currentUser, logout: () => undefined },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeskShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("does not search on a single character — every member matches one letter", fakeAsync(() => {
    component.onSearch("a");
    tick(300);

    expect(clients.list).not.toHaveBeenCalled();
    expect(component.resultsOpen()).toBe(false);
  }));

  it("searches once the term is worth searching for", fakeAsync(() => {
    component.onSearch("ahm");
    tick(300);

    expect(clients.list).toHaveBeenCalledWith({ search: "ahm", per_page: 6 });
    expect(component.results().length).toBe(1);
    expect(component.resultsOpen()).toBe(true);
  }));

  it("debounces a burst of typing into one request", fakeAsync(() => {
    component.onSearch("ah");
    component.onSearch("ahm");
    component.onSearch("ahme");
    tick(300);

    expect(clients.list).toHaveBeenCalledTimes(1);
    expect(clients.list).toHaveBeenCalledWith({ search: "ahme", per_page: 6 });
  }));

  it("empties the list when a lookup fails rather than leaving the last results up", fakeAsync(() => {
    component.onSearch("ahm");
    tick(300);
    expect(component.results().length).toBe(1);

    clients.list.and.returnValue(throwError(() => new Error("offline")));
    component.onSearch("other");
    tick(300);

    expect(component.results()).toEqual([]);
    expect(component.searching()).toBe(false);
  }));

  it("clears the search when a member is opened, so the next person starts fresh", () => {
    const router = TestBed.inject(Router);
    spyOn(router, "navigate");
    component.results.set([client()]);
    component.query.set("ahm");

    component.open(client());

    expect(router.navigate).toHaveBeenCalledWith(["/admin/clients", "c1"]);
    expect(component.query()).toBe("");
    expect(component.resultsOpen()).toBe(false);
  });

  it("closes the search on Escape", () => {
    component.query.set("ahm");
    component.resultsOpen.set(true);

    component.onEsc();

    expect(component.query()).toBe("");
    expect(component.resultsOpen()).toBe(false);
  });

  it("offers no route the desk has no business on", () => {
    const paths = component.navItems.map((i) => i.path);

    expect(paths).not.toContain("/admin/settings");
    expect(paths).not.toContain("/admin/team");
    expect(paths).not.toContain("/admin/dashboard");
  });

  // A moderator the admin posted to several salles works for one at a time.
  describe("the salle switcher", () => {
    const salles = [
      { id: "s1", name: "Salle Sousse", logo_url: null, currency: "TND", active: true },
      { id: "s2", name: "Salle Tunis", logo_url: null, currency: "TND", active: false },
    ];

    function withSalles(list: typeof salles | null): DeskShellComponent {
      currentUser.and.returnValue({ full_name: "Desk", email: "desk@gymly.test", companies: list });
      const fresh = TestBed.createComponent(DeskShellComponent);
      fresh.detectChanges();
      return fresh.componentInstance;
    }

    it("is not there for a moderator working in one salle", () => {
      expect(withSalles(null).salles()).toBeNull();
      expect(withSalles([salles[0]]).salles()).toBeNull();
    });

    it("lists the salles and names the one the desk works for", () => {
      const desk = withSalles(salles);

      expect(desk.salles()?.length).toBe(2);
      expect(desk.activeSalle()?.name).toBe("Salle Sousse");
    });

    it("moves the session and reloads", () => {
      const desk = withSalles(salles);
      const reload = spyOn(desk as unknown as { reloadToHome(): void }, "reloadToHome");

      desk.switchSalle("s2");

      expect(companies.switchTo).toHaveBeenCalledWith("s2");
      expect(reload).toHaveBeenCalled();
    });

    it("does nothing for the salle it already works for", () => {
      const desk = withSalles(salles);

      desk.switchSalle("s1");

      expect(companies.switchTo).not.toHaveBeenCalled();
    });

    it("stops and closes the menu when the switch fails", () => {
      const desk = withSalles(salles);
      companies.switchTo.and.returnValue(throwError(() => new Error("nope")));
      desk.userMenuOpen.set(true);

      desk.switchSalle("s2");

      expect(desk.switching()).toBeFalse();
      expect(desk.userMenuOpen()).toBeFalse();
    });
  });
});
