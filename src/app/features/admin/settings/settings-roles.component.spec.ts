import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Role } from "../../../core/models/role.model";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { RolesService } from "../../../core/services/roles.service";
import { ToastService } from "../../../core/services/toast.service";
import { SettingsRolesComponent } from "./settings-roles.component";

describe("SettingsRolesComponent", () => {
  let fixture: ComponentFixture<SettingsRolesComponent>;
  let component: SettingsRolesComponent;
  let service: jasmine.SpyObj<RolesService>;
  let confirmService: ConfirmService;
  let toast: ToastService;
  let config: jasmine.SpyObj<ConfigurationService>;

  const adminRole: Role = { id: "r1", key: "admin", name: "Admin", permissions: ["clients", "payments"], builtin: true, deletable: false, staff_count: 0 };
  const receptionRole: Role = { id: "r2", key: "moderator", name: "Réception", permissions: ["clients"], builtin: true, deletable: false, staff_count: 2 };
  const customRole: Role = { id: "r3", key: "accountant", name: "Comptable", permissions: ["payments"], builtin: false, deletable: true, staff_count: 0 };
  const catalog = { clients: "Membres", checkin: "Pointage", payments: "Paiements", activities: "Activités", coaches: "Coachs", mystery: "Mystère" };

  beforeEach(async () => {
    service = jasmine.createSpyObj<RolesService>("RolesService", ["list", "create", "update", "delete"]);
    service.list.and.returnValue(of({ roles: [adminRole, receptionRole, customRole], permission_catalog: catalog }));
    config = jasmine.createSpyObj<ConfigurationService>("ConfigurationService", ["setRoles"]);

    await TestBed.configureTestingModule({
      imports: [SettingsRolesComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: RolesService, useValue: service }, { provide: ConfigurationService, useValue: config }],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsRolesComponent);
    component = fixture.componentInstance;
    confirmService = TestBed.inject(ConfirmService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  const clientsGroup = () => component.groups().find((g) => g.id === "front")!;

  it("loads the roles and the permission catalog, and shares the roles", () => {
    expect(component.roles().length).toBe(3);
    expect(component.totalPerms()).toBe(6);
    expect(config.setRoles).toHaveBeenCalledWith([adminRole, receptionRole, customRole]);
  });

  it("flags a failed load", () => {
    service.list.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.loadError()).toBeTrue();
  });

  it("puts the admin first, then built-in roles, then custom ones — one column each, plus the new-role column", () => {
    expect(component.columns().map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    const heads = fixture.nativeElement.querySelectorAll(".rm-table thead th");
    expect(heads.length).toBe(1 + 3 + 1);
  });

  it("groups the catalog by domain, unknown keys last, and filters rows by the search", () => {
    expect(component.groups().map((g) => g.id)).toEqual(["front", "planning", "sales", "other"]);
    expect(component.groups().at(-1)!.keys).toEqual(["mystery"]);

    component.query.set("paiem");
    expect(component.groups().flatMap((g) => g.keys)).toEqual(["payments"]);
  });

  it("keeps the admin's column full and locked", () => {
    expect(component.isOn(adminRole, "activities")).toBeTrue();
    component.toggle(adminRole, "activities");
    expect(component.changeCount()).toBe(0);
    expect(component.roleCount(adminRole)).toBe(6);

    const adminBoxes = Array.from(fixture.nativeElement.querySelectorAll("button.rm-box.is-locked")) as HTMLButtonElement[];
    expect(adminBoxes.length).toBeGreaterThan(0);
    expect(adminBoxes.every((b) => b.disabled)).toBeTrue();
  });

  it("counts a ticked box as a pending change, marks it, and reset drops it", () => {
    component.toggle(receptionRole, "checkin");
    expect(component.isOn(receptionRole, "checkin")).toBeTrue();
    expect(component.isChanged(receptionRole, "checkin")).toBeTrue();
    expect(component.changeCount()).toBe(1);

    component.toggle(customRole, "payments");
    expect(component.changeCount()).toBe(2);

    component.reset();
    expect(component.changeCount()).toBe(0);
    expect(component.isOn(receptionRole, "checkin")).toBeFalse();
  });

  it("ticks a whole group for one role, then clears it", () => {
    expect(component.groupState(receptionRole, clientsGroup())).toBe("some");

    component.toggleGroup(receptionRole, clientsGroup());
    expect(component.groupState(receptionRole, clientsGroup())).toBe("all");

    component.toggleGroup(receptionRole, clientsGroup());
    expect(component.groupState(receptionRole, clientsGroup())).toBe("none");
  });

  it("saves every changed role together, in catalogue order, then reloads", () => {
    service.update.and.returnValue(of({ role: receptionRole }));
    component.toggle(receptionRole, "payments");
    component.toggle(receptionRole, "checkin");

    component.save();

    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith("r2", { permissions: ["clients", "checkin", "payments"] });
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it("shows the backend error when saving fails", () => {
    service.update.and.returnValue(throwError(() => ({ error: { error: "Nope" } })));
    const spy = spyOn(toast, "error");
    component.toggle(receptionRole, "payments");

    component.save();

    expect(spy).toHaveBeenCalled();
    expect(component.saving()).toBeFalse();
  });

  it("creates a new role, empty, from the name dialog — the name is required", async () => {
    service.create.and.returnValue(of({ role: { ...customRole, id: "r9", name: "Soir" } }));
    await component.startCreate();
    expect(component.nameDialog()?.mode).toBe("create");

    component.submitName();
    expect(component.nameError()).toBeTruthy();
    expect(service.create).not.toHaveBeenCalled();

    component.draftName.set("  Soir ");
    component.submitName();
    expect(service.create).toHaveBeenCalledWith({ name: "Soir", permissions: [] });
    expect(component.nameDialog()).toBeNull();
  });

  it("asks before dropping unsaved boxes to add a role", async () => {
    component.toggle(receptionRole, "payments");
    const ask = spyOn(confirmService, "ask").and.resolveTo(false);

    await component.startCreate();

    expect(ask).toHaveBeenCalled();
    expect(component.nameDialog()).toBeNull();
  });

  it("renames a custom role, never a built-in one", async () => {
    service.update.and.returnValue(of({ role: customRole }));
    await component.startRename(receptionRole);
    expect(component.nameDialog()).toBeNull();

    await component.startRename(customRole);
    component.draftName.set("Compta");
    component.submitName();
    expect(service.update).toHaveBeenCalledWith("r3", { name: "Compta" });
  });

  it("remove does nothing when declined, and deletes when confirmed", async () => {
    service.delete.and.returnValue(of(void 0));
    const ask = spyOn(confirmService, "ask").and.resolveTo(false);
    await component.remove(customRole);
    expect(service.delete).not.toHaveBeenCalled();

    ask.and.resolveTo(true);
    await component.remove(customRole);
    expect(service.delete).toHaveBeenCalledWith("r3");
  });

  it("shows the owner on the admin role, never a 0 count, and caps only the moderator", () => {
    const translate = TestBed.inject(TranslateService);
    expect(component.accountsLabel(adminRole)).toBe(translate.instant("settings.role_accounts_owner"));
    expect(component.isCappedRole(receptionRole)).toBeTrue();
    expect(component.isCappedRole(customRole)).toBeFalse();
  });
});
