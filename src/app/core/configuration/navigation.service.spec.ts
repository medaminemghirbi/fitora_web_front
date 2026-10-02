import { TestBed } from "@angular/core/testing";
import { AuthService } from "../auth/auth.service";
import { NavigationService } from "./navigation.service";

describe("NavigationService", () => {
  let service: NavigationService;
  let authStub: { currentUser: jasmine.Spy; hasPermission: jasmine.Spy; hasFeature: jasmine.Spy };

  function build(role: string, permissions: string[], features: string[] = []): void {
    TestBed.resetTestingModule();
    authStub = {
      currentUser: jasmine.createSpy().and.returnValue({ role }),
      hasPermission: jasmine.createSpy().and.callFake((p: string) => permissions.includes(p)),
      hasFeature: jasmine.createSpy().and.callFake((f: string) => features.includes(f)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: authStub }] });
    service = TestBed.inject(NavigationService);
  }

  it("an admin sees the dashboard and every group, including the admin-only Team group", () => {
    build("admin", ["reports", "coaches"]);
    expect(service.dashboardItem()?.path).toBe("/admin/dashboard");
    expect(service.groups().some((g) => g.id === "team")).toBe(true);
    // calendar carries no `permission` — visible to anyone.
    const planning = service.groups().find((g) => g.id === "planning")!;
    expect(planning.items.map((i) => i.path)).toContain("/admin/calendar");
  });

  it("hides rooms from a gym that has not turned them on, permission or not", () => {
    build("admin", ["spaces"]);

    const planning = service.groups().find((g) => g.id === "planning")!;
    expect(planning.items.map((i) => i.path)).not.toContain("/admin/spaces");
  });

  it("shows rooms once the feature is on and the permission is held", () => {
    build("admin", ["spaces"], ["spaces"]);

    const planning = service.groups().find((g) => g.id === "planning")!;
    expect(planning.items.map((i) => i.path)).toContain("/admin/spaces");
  });

  it("still hides rooms from a login without the permission, feature or not", () => {
    build("staff", [], ["spaces"]);

    const planning = service.groups().find((g) => g.id === "planning")!;
    expect(planning.items.map((i) => i.path)).not.toContain("/admin/spaces");
  });

  it("hides the dashboard without the 'reports' permission", () => {
    build("staff", []);
    expect(service.dashboardItem()).toBeNull();
  });

  it("shows the dashboard for staff once they have 'reports'", () => {
    build("staff", ["reports"]);
    expect(service.dashboardItem()).not.toBeNull();
  });

  it("drops the admin-only Team group entirely for staff, even with every permission", () => {
    build("staff", ["clients", "contracts", "bookings", "payments", "coaches"]);
    expect(service.groups().some((g) => g.id === "team")).toBe(false);
  });

  it("drops a group with no visible items", () => {
    build("staff", []);
    // "finances" only has one item, gated on "payments" — invisible without it.
    expect(service.groups().some((g) => g.id === "finances")).toBe(false);
  });

  it("filters items within a visible group by permission", () => {
    build("staff", ["contracts"]);
    const subscriptions = service.groups().find((g) => g.id === "subscriptions")!;
    // The catalogue entries need "contract_types", which this login lacks.
    expect(subscriptions.items.map((i) => i.path)).toEqual(["/admin/contracts"]);
  });

  it("secondaryItems is empty for a non-admin (every entry is adminOnly)", () => {
    build("staff", []);
    expect(service.secondaryItems()).toEqual([]);
  });

  it("secondaryItems lists everything for an admin", () => {
    build("admin", []);
    expect(service.secondaryItems().map((i) => i.path)).toEqual([
      "/admin/salles",
      "/admin/subscription",
      "/admin/settings",
    ]);
  });

  it("homePath is the dashboard path when visible", () => {
    build("admin", ["reports"]);
    expect(service.homePath()).toBe("/admin/dashboard");
  });

  it("homePath falls back to the first visible group item when the dashboard isn't visible", () => {
    build("staff", ["clients"]);
    // "management" (clients, contracts) comes before "planning" (calendar) in
    // the blueprint, so the permitted /admin/clients wins over the
    // always-visible /admin/calendar.
    expect(service.homePath()).toBe("/admin/clients");
  });

  it("homePath falls back to the first always-visible item (no permission required) when the login has none", () => {
    build("staff", []);
    // Every current blueprint item without a `permission` is unconditionally
    // visible (only admin-only *groups* are gated by role) — so with no
    // permissions granted, "planning"/"calendar" is the first visible group.
    expect(service.homePath()).toBe("/admin/calendar");
  });
});
