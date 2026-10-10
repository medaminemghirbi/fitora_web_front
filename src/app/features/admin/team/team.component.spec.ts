import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { EMPTY, of, throwError } from "rxjs";
import { AuthService } from "../../../core/auth/auth.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { Coach } from "../../../core/models/coach.model";
import { StaffMember } from "../../../core/models/staff-member.model";
import { CoachesService } from "../../../core/services/coaches.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { StaffService } from "../../../core/services/staff.service";
import { ToastService } from "../../../core/services/toast.service";
import { TeamComponent, TeamMember } from "./team.component";

const coach: Coach = {
  id: "c1", company_id: "1", first_name: "Sarah", last_name: "Martin", full_name: "Sarah Martin",
  email: "sarah@x.test", phone: null, bio: null, photo_url: null, birthdate: null, active: true,
  has_login: true, login_email: "sarah@x.test",
};

const moderator: StaffMember = {
  id: "s1", role: "moderator", role_key: "moderator", role_name: "Modérateur",
  permissions: ["clients", "bookings"], active: true, birthdate: null,
  user: { id: "u1", full_name: "Khaled Zaidi", email: "khaled@x.test", phone: null },
  coach_id: null,
};

const coachStaff: StaffMember = {
  id: "s2", role: "coach", role_key: "coach", role_name: "Coach", permissions: ["checkin"],
  active: true, birthdate: null, user: { id: "u2", full_name: "Sarah Martin", email: "sarah@x.test", phone: null },
  coach_id: "c1",
};

const moderatorRole = { id: "r1", key: "moderator", name: "Modérateur", permissions: ["clients"], builtin: true };
const coachRole = { id: "r2", key: "coach", name: "Coach", permissions: ["checkin"], builtin: true };
const adminRole = { id: "r3", key: "admin", name: "Admin", permissions: [], builtin: true };
const accountantRole = { id: "r4", key: "comptable", name: "Comptable", permissions: ["payments", "revenue"], builtin: false };

const accountant: StaffMember = {
  id: "s3", role: "moderator", role_key: "comptable", role_name: "Comptable",
  permissions: ["payments", "revenue"], active: true, birthdate: null,
  user: { id: "u3", full_name: "Sami Ben Ali", email: "sami@x.test", phone: null },
  coach_id: null,
};

describe("TeamComponent", () => {
  let fixture: ComponentFixture<TeamComponent>;
  let component: TeamComponent;
  let coachesService: jasmine.SpyObj<CoachesService>;
  let staffService: jasmine.SpyObj<StaffService>;
  let confirmService: ConfirmService;
  let toast: ToastService;
  let authStub: { currentUser: jasmine.Spy };

  function build(
    role: string,
    queryParams: Record<string, string> = {},
    staff: StaffMember[] = [moderator, coachStaff],
    roles: object[] = [adminRole, moderatorRole, coachRole]
  ): void {
    TestBed.resetTestingModule();
    coachesService = jasmine.createSpyObj("CoachesService", ["list", "create", "update", "deactivate", "setLogin", "get"]);
    // The single-coach fetch that brings the whole e-mail; silent unless a test says otherwise.
    coachesService.get.and.returnValue(EMPTY);
    staffService = jasmine.createSpyObj("StaffService", ["list", "create", "update"]);
    coachesService.list.and.returnValue(of({ coaches: [coach] }));
    staffService.list.and.returnValue(of({ staff }));
    authStub = { currentUser: jasmine.createSpy().and.returnValue({ role }) };

    TestBed.configureTestingModule({
      imports: [TeamComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CoachesService, useValue: coachesService },
        { provide: StaffService, useValue: staffService },
        { provide: AuthService, useValue: authStub },
        {
          provide: ConfigurationService,
          useValue: {
            roles: () => roles,
            roleName: (key: string) => ({ coach: "Coach", moderator: "Modérateur" })[key] ?? key,
          },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });

    fixture = TestBed.createComponent(TeamComponent);
    component = fixture.componentInstance;
    confirmService = TestBed.inject(ConfirmService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  }

  beforeEach(() => build("admin"));

  it("merges coaches and back-office staff, hiding the coach's linked staff record", () => {
    expect(component.members().length).toBe(2);
    expect(component.members().find((m) => m.name === "Sarah Martin")?.hasMobile).toBe(true);
    expect(component.members().find((m) => m.name === "Khaled Zaidi")?.hasWeb).toBe(true);
  });

  it("sets the error flag when loading fails", () => {
    coachesService.list.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  it("a non-admin does not fetch back-office staff", () => {
    build("staff");
    expect(staffService.list).not.toHaveBeenCalled();
    expect(component.members().every((m) => !!m.coach)).toBe(true);
  });

  it("opens the create drawer automatically for ?action=new", () => {
    build("admin", { action: "new" });
    expect(component.createOpen()).toBe(true);
    expect(component.createKind()).toBe("coach");
  });

  it("opens the backoffice create drawer for ?action=new&type=backoffice, admin only", () => {
    build("admin", { action: "new", type: "backoffice" }, [coachStaff]);
    expect(component.createKind()).toBe("backoffice");
  });

  it("falls back to the coach flow when the salle already has its moderator", () => {
    build("admin", { action: "new", type: "backoffice" });
    expect(component.hasModerator()).toBe(true);
    expect(component.createKind()).toBe("coach");
  });

  it("counts only an active non-coach login as the salle's moderator", () => {
    build("admin", {}, [{ ...moderator, active: false }, coachStaff]);
    expect(component.hasModerator()).toBe(false);
  });

  it("caps only the moderator role: a custom-role login does not take the seat", () => {
    build("admin", {}, [accountant, coachStaff], [adminRole, moderatorRole, coachRole, accountantRole]);
    expect(component.hasModerator()).toBe(false);
    expect(component.availableBackofficeRoles().map((r) => r.key)).toEqual(["moderator", "comptable"]);
  });

  it("still opens the back-office flow on a custom role when the moderator is taken", () => {
    build("admin", { action: "new", type: "backoffice" }, [moderator, coachStaff], [adminRole, moderatorRole, coachRole, accountantRole]);
    expect(component.backofficeAvailable()).toBe(true);
    expect(component.createKind()).toBe("backoffice");
    expect(component.backofficeForm.controls.role_id.value).toBe("r4");
    expect(component.isRoleTaken(moderatorRole)).toBe(true);
    expect(component.isRoleTaken(accountantRole)).toBe(false);
  });

  it("lets the current moderator keep their role in the edit dialog", () => {
    expect(component.isRoleTaken(moderatorRole, moderator)).toBe(false);
    expect(component.isRoleTaken(moderatorRole, accountant)).toBe(true);
  });

  it("previews what the picked role grants", () => {
    build("admin", {}, [moderator], [adminRole, moderatorRole, coachRole, accountantRole]);
    expect(component.roleAccessSummary("r4")).toBe("team.access_revenue · team.access_payments");
    expect(component.roleAccessSummary("nope")).toBe("");
  });

  it("names the member holding the back-office seat", () => {
    build("admin", {}, [moderator, coachStaff]);
    expect(component.moderator()?.staff?.id).toBe(moderator.id);
    build("admin", {}, [{ ...moderator, active: false }, coachStaff]);
    expect(component.moderator()).toBeNull();
  });

  it("a non-admin always gets the coach create flow regardless of ?type", () => {
    build("staff", { action: "new", type: "backoffice" });
    expect(component.createKind()).toBe("coach");
  });

  it("filtered narrows by tab", () => {
    component.tab.set("coaches");
    expect(component.filtered().every((m) => !!m.coach)).toBe(true);
    component.tab.set("backoffice");
    expect(component.filtered().every((m) => !!m.staff)).toBe(true);
  });

  it("filtered narrows by a search term across name/email/phone", () => {
    component.search.set("sarah");
    expect(component.filtered().every((m) => m.name.toLowerCase().includes("sarah"))).toBe(true);
  });

  it("changing tab or search resets to page 1", () => {
    component.page.set(3);
    component.tab.set("coaches");
    fixture.detectChanges();
    expect(component.page()).toBe(1);
  });

  it("hasFilters / resetFilters", () => {
    component.search.set("sarah");
    component.applyTab("coaches");
    expect(component.hasFilters()).toBe(true);
    component.resetFilters();
    expect(component.hasFilters()).toBe(false);
    expect(component.search()).toBe("");
    expect(component.tab()).toBe("all");
  });

  it("filterChips is empty with no active filters", () => {
    expect(component.filterChips()).toEqual([]);
  });

  it("filterChips reflects search and tab, each clearing independently", () => {
    component.search.set("sarah");
    component.applyTab("coaches");
    const chips = component.filterChips();
    expect(chips.length).toBe(2);
    expect(chips[0].label).toContain("sarah");

    chips[1].clear();
    expect(component.tab()).toBe("all");
    expect(component.search()).toBe("sarah");
  });

  it("tabs includes backoffice only for an admin", () => {
    expect(component.tabs().map((t) => t.id)).toEqual(["all", "coaches", "backoffice"]);
    build("staff");
    expect(component.tabs().map((t) => t.id)).toEqual(["all", "coaches"]);
  });

  it("backofficeRoles excludes coach and admin", () => {
    expect(component.backofficeRoles().map((r) => r.key)).toEqual(["moderator"]);
  });

  it("openCreate defaults role_id to '' when there is no backoffice role", () => {
    const config = TestBed.inject(ConfigurationService);
    spyOn(config, "roles").and.returnValue([adminRole, coachRole]);
    component.openCreate("backoffice");
    expect(component.backofficeForm.value.role_id).toBe("");
  });

  describe("create coach", () => {
    it("openCreate defaults to the coach flow when called with no kind", () => {
      component.openCreate();
      expect(component.createKind()).toBe("coach");
    });

    it("openCreate forces coach for a non-admin even if asked for backoffice", () => {
      build("staff");
      component.openCreate("backoffice");
      expect(component.createKind()).toBe("coach");
    });

    it("does not submit with a missing name", () => {
      component.openCreate("coach");
      component.submitCreate();
      expect(coachesService.create).not.toHaveBeenCalled();
    });

    it("requires an email + 8-char password when with_mobile is checked", () => {
      component.openCreate("coach");
      component.coachForm.patchValue({ first_name: "S", last_name: "M", with_mobile: true, email: "", password: "" });
      component.submitCreate();
      expect(coachesService.create).not.toHaveBeenCalled();
      expect(component.createError()).toBeTruthy();
    });

    it("creates a coach without mobile login", () => {
      coachesService.create.and.returnValue(of({ coach }));
      component.openCreate("coach");
      component.coachForm.patchValue({ first_name: "Sarah", last_name: "Martin" });
      component.submitCreate();
      expect(coachesService.create).toHaveBeenCalled();
      expect(coachesService.setLogin).not.toHaveBeenCalled();
      expect(component.createOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("creates a coach and sets up the mobile login", () => {
      coachesService.create.and.returnValue(of({ coach }));
      coachesService.setLogin.and.returnValue(of({ coach }));
      component.openCreate("coach");
      component.coachForm.patchValue({ first_name: "Sarah", last_name: "Martin", with_mobile: true, email: "s@x.test", password: "secret123" });
      component.submitCreate();
      expect(coachesService.setLogin).toHaveBeenCalledWith("c1", "s@x.test", "secret123");
      expect(component.createOpen()).toBe(false);
    });

    it("surfaces an error when the mobile login step fails", () => {
      coachesService.create.and.returnValue(of({ coach }));
      coachesService.setLogin.and.returnValue(throwError(() => new Error("nope")));
      component.openCreate("coach");
      component.coachForm.patchValue({ first_name: "Sarah", last_name: "Martin", with_mobile: true, email: "s@x.test", password: "secret123" });
      component.submitCreate();
      expect(component.createError()).toBeTruthy();
    });

    it("surfaces the backend error when creating the coach fails", () => {
      coachesService.create.and.returnValue(throwError(() => new Error("nope")));
      component.openCreate("coach");
      component.coachForm.patchValue({ first_name: "Sarah", last_name: "Martin" });
      component.submitCreate();
      expect(component.createError()).toBeTruthy();
    });

    it("closeCreate closes the drawer", () => {
      component.createOpen.set(true);
      component.closeCreate();
      expect(component.createOpen()).toBe(false);
    });
  });

  describe("create back-office staff", () => {
    // A salle with no moderator yet — one is all it may have.
    beforeEach(() => component.staff.set([coachStaff]));

    it("does not submit with an invalid form", () => {
      component.openCreate("backoffice");
      component.backofficeForm.reset();
      component.submitCreate();
      expect(staffService.create).not.toHaveBeenCalled();
    });

    it("creates a back-office account", () => {
      staffService.create.and.returnValue(of({ staff_member: moderator }));
      component.openCreate("backoffice");
      component.backofficeForm.patchValue({ first_name: "K", last_name: "Z", email: "k@x.test", password: "secret123", role_id: "r1" });
      component.submitCreate();
      expect(staffService.create).toHaveBeenCalled();
      expect(component.createOpen()).toBe(false);
    });

    it("surfaces the backend error on failure", () => {
      staffService.create.and.returnValue(throwError(() => new Error("nope")));
      component.openCreate("backoffice");
      component.backofficeForm.patchValue({ first_name: "K", last_name: "Z", email: "k@x.test", password: "secret123", role_id: "r1" });
      component.submitCreate();
      expect(component.createError()).toBeTruthy();
    });
  });

  describe("edit coach profile", () => {
    it("openEditCoach hydrates the form", () => {
      component.openEditCoach(coach);
      expect(component.editingCoach()).toBe(coach);
      expect(component.editCoachForm.value.first_name).toBe("Sarah");
    });

    it("openEditCoach falls back to empty strings for a coach with no optional fields set", () => {
      const bare: Coach = { ...coach, email: null, phone: null, birthdate: null, bio: null };
      component.openEditCoach(bare);
      expect(component.editCoachForm.value.email).toBe("");
      expect(component.editCoachForm.value.phone).toBe("");
      expect(component.editCoachForm.value.birthdate).toBe("");
      expect(component.editCoachForm.value.bio).toBe("");
    });

    it("submitEditCoach does nothing without an editing coach", () => {
      component.submitEditCoach();
      expect(coachesService.update).not.toHaveBeenCalled();
    });

    it("submitEditCoach saves and reloads", () => {
      component.openEditCoach(coach);
      coachesService.update.and.returnValue(of({ coach }));
      component.submitEditCoach();
      expect(component.editCoachOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("openEditCoach swaps the masked list address for the whole one", () => {
      coachesService.get.and.returnValue(of({ coach: { ...coach, email: "sarah.full@x.test" } }));
      component.openEditCoach({ ...coach, email: "sa****ll@x.test" });
      expect(component.editCoachForm.value.email).toBe("sarah.full@x.test");
    });

    it("submitEditCoach never sends a masked address back", () => {
      component.openEditCoach({ ...coach, email: "sa****ll@x.test" });
      coachesService.update.and.returnValue(of({ coach }));
      component.submitEditCoach();
      expect(coachesService.update.calls.mostRecent().args[1].email).toBeUndefined();
    });

    it("submitEditCoach shows the backend error on failure", () => {
      component.openEditCoach(coach);
      coachesService.update.and.returnValue(throwError(() => new Error("nope")));
      component.submitEditCoach();
      expect(component.editCoachError()).toBeTruthy();
    });
  });

  describe("role & web access", () => {
    it("openRole hydrates the form from the matching role", () => {
      component.openRole(moderator);
      expect(component.editingStaff()).toBe(moderator);
      expect(component.roleForm.value.role_id).toBe("r1");
    });

    it("openRole defaults role_id to '' when no role matches the staff member's role_key", () => {
      component.openRole({ ...moderator, role_key: "unknown" });
      expect(component.roleForm.value.role_id).toBe("");
    });

    it("submitRole does nothing without an editing staff member", () => {
      component.submitRole();
      expect(staffService.update).not.toHaveBeenCalled();
    });

    it("submitRole saves and reloads", () => {
      component.openRole(moderator);
      staffService.update.and.returnValue(of({ staff_member: moderator }));
      component.submitRole();
      expect(component.roleOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("submitRole shows the backend error on failure", () => {
      component.openRole(moderator);
      staffService.update.and.returnValue(throwError(() => new Error("nope")));
      component.submitRole();
      expect(component.roleError()).toBeTruthy();
    });
  });

  describe("mobile login", () => {
    it("openLogin hydrates the form from the coach", () => {
      component.openLogin(coach);
      expect(component.loginTarget()).toBe(coach);
      expect(component.loginForm.value.email).toBe("sarah@x.test");
    });

    it("openLogin falls back to the coach's plain email when login_email is unset", () => {
      component.openLogin({ ...coach, login_email: null });
      expect(component.loginForm.value.email).toBe("sarah@x.test");
    });

    it("openLogin swaps the masked list address for the whole login address", () => {
      coachesService.get.and.returnValue(of({ coach: { ...coach, login_email: "sarah.login@x.test" } }));
      component.openLogin({ ...coach, login_email: "sa****in@x.test" });
      expect(component.loginForm.value.email).toBe("sarah.login@x.test");
    });

    it("submitLogin refuses a still-masked address instead of sending it", () => {
      component.openLogin({ ...coach, login_email: "sa****in@x.test" });
      component.loginForm.patchValue({ password: "password123" });
      component.submitLogin();
      expect(coachesService.setLogin).not.toHaveBeenCalled();
      expect(component.loginError()).toBeTruthy();
    });

    it("openLogin falls back to '' when neither login_email nor email is set", () => {
      component.openLogin({ ...coach, login_email: null, email: null });
      expect(component.loginForm.value.email).toBe("");
    });

    it("submitLogin does nothing with an invalid form", () => {
      component.openLogin(coach);
      component.loginForm.reset();
      component.submitLogin();
      expect(coachesService.setLogin).not.toHaveBeenCalled();
    });

    it("submitLogin sets the login and reloads", () => {
      component.openLogin(coach);
      component.loginForm.patchValue({ password: "secret123" });
      coachesService.setLogin.and.returnValue(of({ coach }));
      component.submitLogin();
      expect(component.loginOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("submitLogin shows the backend error on failure", () => {
      component.openLogin(coach);
      component.loginForm.patchValue({ password: "secret123" });
      coachesService.setLogin.and.returnValue(throwError(() => new Error("nope")));
      component.submitLogin();
      expect(component.loginError()).toBeTruthy();
    });
  });

  describe("deactivate", () => {
    const coachMember: TeamMember = { key: "coach:c1", name: "Sarah Martin", email: null, phone: null, active: true, bio: null, hasMobile: true, hasWeb: false, roleName: "Coach", coach, staff: null, staffMemberId: null };
    const staffMember: TeamMember = { key: "staff:s1", name: "Khaled Zaidi", email: null, phone: null, active: true, bio: null, hasMobile: false, hasWeb: true, roleName: "Modérateur", coach: null, staff: moderator, staffMemberId: "s1" };

    it("does nothing when declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.deactivate(coachMember);
      expect(coachesService.deactivate).not.toHaveBeenCalled();
    });

    it("deactivates a coach on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      coachesService.deactivate.and.returnValue(of({ coach }));
      await component.deactivate(coachMember);
      expect(coachesService.deactivate).toHaveBeenCalledWith("c1");
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("deactivates a staff member on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      staffService.update.and.returnValue(of({ staff_member: moderator }));
      await component.deactivate(staffMember);
      expect(staffService.update).toHaveBeenCalledWith("s1", { active: false });
    });

    it("shows an error toast on failure", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      coachesService.deactivate.and.returnValue(throwError(() => new Error("nope")));
      await component.deactivate(coachMember);
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("freeing the seat from the drawer deactivates the moderator, then opens the back-office form", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      staffService.update.and.returnValue(of({ staff_member: moderator }));
      component.freeBackofficeSeat(staffMember);
      await fixture.whenStable();
      expect(staffService.update).toHaveBeenCalledWith("s1", { active: false });
      expect(component.createKind()).toBe("backoffice");
    });
  });

  describe("what a role lets someone do", () => {
    function staffWith(permissions: string[]) {
      return { staff: { permissions } } as never;
    }

    it("says nothing for a coach, who has no back-office role to describe", () => {
      expect(component.permissionSummary({ staff: null } as never)).toBe("");
    });

    it("names what differs, in the order it matters", () => {
      const summary = component.permissionSummary(staffWith(["clients", "checkin", "payments"]));

      // Money first, attendance last — the order the constant declares, not
      // the order the backend happened to send.
      expect(summary).toBe("team.access_payments · team.access_clients · team.access_checkin");
    });

    it("says 'everything' rather than listing all of them", () => {
      const summary = component.permissionSummary(
        staffWith(["revenue", "payments", "clients", "sessions", "bookings", "checkin", "reports"])
      );

      expect(summary).toBe("team.access_everything");
    });

    it("says so plainly when a role grants nothing worth naming", () => {
      expect(component.permissionSummary(staffWith(["reports"]))).toBe("team.access_nothing");
    });
  });
});
