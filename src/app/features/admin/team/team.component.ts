import { isMaskedEmail } from "../../../core/utils/email-mask";
import { Component, OnInit, computed, effect, signal } from "@angular/core";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { forkJoin, of, Observable } from "rxjs";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Coach } from "../../../core/models/coach.model";
import { StaffMember } from "../../../core/models/staff-member.model";
import { CoachesService } from "../../../core/services/coaches.service";
import { StaffService } from "../../../core/services/staff.service";
import { AuthService } from "../../../core/auth/auth.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { AvatarComponent } from "../../../shared/components/avatar.component";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { HighlightPipe } from "../../../shared/pipes/highlight.pipe";
import { PaginationComponent } from "../../../shared/components/pagination.component";
import { clientPageMeta, filterBySearch, pageSlice } from "../../../shared/utils/client-list";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ActionMenuComponent } from "../../../shared/ui/action-menu.component";
import { DrawerComponent } from "../../../shared/ui/drawer.component";
import { StatusFilterComponent, StatusFilterOption } from "../../../shared/ui/status-filter.component";

type Tab = "all" | "coaches" | "backoffice";
type CreateKind = "coach" | "backoffice";

// One entry per person. `coach` = a schedulable trainer (may also hold a
// mobile-app login). `staff` = a back-office (web) account.
// A coach's mobile login is itself a role:"coach" staff record on the backend,
// so those are filtered out of the back-office list — the coach entry already
// represents them.
export interface TeamMember {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  bio: string | null;
  hasMobile: boolean;
  hasWeb: boolean;
  roleName: string;
  coach: Coach | null;
  staff: StaffMember | null;
  // Set for anyone with a staff account (coach mobile login included).
  staffMemberId: string | null;
}

// The built-in role capped at one active login per salle (StaffMember::MODERATOR_ROLE_KEY).
const MODERATOR_ROLE_KEY = "moderator";

/**
 * The capabilities worth naming on a row, most consequential first. The
 * catalogue has eleven; listing all of them would be unreadable, and most
 * never differ between two real roles.
 */
const PERMISSION_ORDER = ["revenue", "payments", "clients", "sessions", "bookings", "checkin"] as const;

@Component({
  selector: "app-team",
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
    AvatarComponent,
    EmptyStateComponent,
    ModalComponent,
    StatusBadgeComponent,
    HighlightPipe,
    PaginationComponent,
    SkeletonComponent,
    ErrorStateComponent,
    ActionMenuComponent,
    DrawerComponent,
    StatusFilterComponent,
  ],
  templateUrl: "./team.component.html",
  styleUrl: "./team.component.scss",
})
export class TeamComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);

  readonly coaches = signal<Coach[]>([]);
  readonly staff = signal<StaffMember[]>([]);
  /**
   * A salle has at most one active login on the built-in moderator role.
   * Other back-office roles (custom ones) and coaches are uncapped.
   */
  readonly hasModerator = computed(() =>
    this.staff().some((s) => s.active && !s.coach_id && s.role_key === MODERATOR_ROLE_KEY)
  );
  readonly tab = signal<Tab>("all");

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === "admin");

  // The company's name for the schedulable "coach" role — "Praticien",
  // "Vétérinaire", "Formateur"… for non-fitness industries (set by the
  // industry preset), "Coach" by default.
  readonly practitionerRole = computed(() => this.config.roleName("coach"));

  readonly members = computed<TeamMember[]>(() => {
    const staffByCoach = new Map(this.staff().filter((s) => s.coach_id).map((s) => [s.coach_id!, s]));

    const fromCoaches: TeamMember[] = this.coaches().map((c) => ({
      key: "coach:" + c.id,
      name: c.full_name,
      email: c.email,
      phone: c.phone,
      active: c.active,
      bio: c.bio,
      hasMobile: c.has_login,
      hasWeb: false,
      roleName: this.practitionerRole(),
      coach: c,
      staff: null,
      staffMemberId: staffByCoach.get(c.id)?.id ?? null,
    }));

    const fromStaff: TeamMember[] = this.staff()
      .filter((s) => s.role !== "coach")
      .map((s) => ({
        key: "staff:" + s.id,
        name: s.user.full_name,
        email: s.user.email,
        phone: s.user.phone,
        active: s.active,
        bio: null,
        hasMobile: false,
        hasWeb: true,
        roleName: this.config.roleName(s.role_key),
        coach: null,
        staff: s,
        staffMemberId: s.id,
      }));

    return [...fromCoaches, ...fromStaff].sort((a, b) => a.name.localeCompare(b.name));
  });

  /** The member holding the salle's moderator role, if any. */
  readonly moderator = computed(
    () => this.members().find((m) => m.active && !!m.staff && !m.staff.coach_id && m.staff.role_key === MODERATOR_ROLE_KEY) ?? null
  );

  /**
   * What a role lets someone do, in plain words.
   *
   * A row that says "Réception" tells you the role's name and nothing about
   * its powers; finding those out meant opening the permissions editor. This
   * names the three or four things that actually differ between roles, in
   * the order they matter, and says "tout" rather than listing eleven.
   */
  permissionSummary(member: TeamMember): string {
    if (!member.staff) return "";

    const held = member.staff.permissions;
    if (PERMISSION_ORDER.every((key) => held.includes(key))) {
      return this.translate.instant("team.access_everything");
    }

    const named = PERMISSION_ORDER.filter((key) => held.includes(key)).map((key) =>
      this.translate.instant("team.access_" + key)
    );

    return named.length > 0 ? named.join(" · ") : this.translate.instant("team.access_nothing");
  }

  readonly search = signal("");
  readonly page = signal(1);

  readonly filtered = computed<TeamMember[]>(() => {
    const t = this.tab();
    let list = this.members();
    if (t === "coaches") list = list.filter((m) => m.coach);
    else if (t === "backoffice") list = list.filter((m) => m.staff);

    const access = this.accessFilter();
    if (access === "mobile") list = list.filter((m) => m.hasMobile);
    else if (access === "web") list = list.filter((m) => m.hasWeb);
    else if (access === "none") list = list.filter((m) => !m.hasMobile && !m.hasWeb);

    return filterBySearch(list, this.search(), (m) => [m.name, m.email, m.phone]);
  });

  readonly pagedMembers = computed(() => pageSlice(this.filtered(), this.page()));
  readonly meta = computed(() => clientPageMeta(this.filtered().length, this.page()));

  // Page reset on change is handled by the effect in the constructor.
  applyTab(id: Tab): void {
    this.tab.set(id);
  }

  hasFilters(): boolean {
    return this.search() !== "" || this.tab() !== "all" || this.accessFilter() !== "";
  }

  resetFilters(): void {
    this.search.set("");
    this.tab.set("all");
    this.accessFilter.set("");
  }

  applyAccessFilter(value: string): void {
    this.accessFilter.set(value as "" | "mobile" | "web" | "none");
    this.page.set(1);
  }

  readonly filterChips = computed(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (this.search()) chips.push({ label: `« ${this.search()} »`, clear: () => this.search.set("") });
    const t = this.tab();
    if (t !== "all") {
      const opt = this.tabs().find((o) => o.id === t);
      if (opt) chips.push({ label: opt.label, clear: () => this.applyTab("all") });
    }
    return chips;
  });

  readonly tabs = computed<{ id: Tab; label: string; color: string; count: number }[]>(() => {
    const all = this.members();
    const base: { id: Tab; label: string; color: string; count: number }[] = [
      { id: "all", label: this.translate.instant("team.tab_all"), color: "var(--color-primary)", count: all.length },
      { id: "coaches", label: this.practitionerRole(), color: "var(--color-info)", count: all.filter((m) => m.coach).length },
    ];
    if (this.isAdmin()) {
      base.push({
        id: "backoffice",
        label: this.translate.instant("team.tab_backoffice"),
        color: "var(--color-success)",
        count: all.filter((m) => m.staff).length,
      });
    }
    return base;
  });

  /** The access pills: who can sign in where. */
  readonly accessFilter = signal<"" | "mobile" | "web" | "none">("");

  readonly accessOptions = computed<StatusFilterOption[]>(() => {
    const all = this.members();
    return [
      { value: "", label: this.translate.instant("common.all"), count: all.length, color: "var(--color-primary)" },
      { value: "mobile", label: this.translate.instant("team.access_mobile"), count: all.filter((m) => m.hasMobile).length, color: "var(--color-info)" },
      { value: "web", label: this.translate.instant("team.access_web"), count: all.filter((m) => m.hasWeb).length, color: "var(--color-success)" },
      { value: "none", label: this.translate.instant("team.access_none"), count: all.filter((m) => !m.hasMobile && !m.hasWeb).length, color: "var(--color-muted)" },
    ];
  });

  // ---- create (drawer) ----
  readonly createOpen = signal(false);
  readonly createKind = signal<CreateKind>("coach");
  readonly createError = signal<string | null>(null);

  readonly coachForm = this.fb.nonNullable.group({
    first_name: ["", Validators.required],
    last_name: ["", Validators.required],
    email: [""],
    phone: [""],
    birthdate: [""],
    bio: [""],
    with_mobile: [false],
    password: [""],
  });

  readonly backofficeForm = this.fb.nonNullable.group({
    first_name: ["", Validators.required],
    last_name: ["", Validators.required],
    email: ["", [Validators.required, Validators.email]],
    phone: [""],
    birthdate: [""],
    password: ["", [Validators.required, Validators.minLength(8)]],
    role_id: ["", Validators.required],
  });

  // ---- edit coach profile (modal) ----
  readonly editCoachOpen = signal(false);
  readonly editingCoach = signal<Coach | null>(null);
  readonly editCoachError = signal<string | null>(null);
  readonly editCoachForm = this.fb.nonNullable.group({
    first_name: ["", Validators.required],
    last_name: ["", Validators.required],
    email: [""],
    phone: [""],
    birthdate: [""],
    bio: [""],
  });

  // ---- role & web access (modal) ----
  readonly roleOpen = signal(false);
  readonly editingStaff = signal<StaffMember | null>(null);
  readonly roleError = signal<string | null>(null);
  readonly roleForm = this.fb.nonNullable.group({
    role_id: ["", Validators.required],
    active: [true],
    birthdate: [""],
  });

  // ---- mobile login (modal) ----
  readonly loginOpen = signal(false);
  readonly loginTarget = signal<Coach | null>(null);
  readonly loginError = signal<string | null>(null);
  readonly loginForm = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(8)]],
  });

  // Roles assignable to a back-office (web) login: every company role except
  // "coach" (its own creation flow) and "admin" (never assigned to staff).
  readonly backofficeRoles = computed(() =>
    this.config.roles().filter((r) => r.key !== "coach" && r.key !== "admin")
  );

  /** Roles a new back-office login can take: all but the moderator once it is held. */
  readonly availableBackofficeRoles = computed(() => this.backofficeRoles().filter((r) => !this.isRoleTaken(r)));
  readonly backofficeAvailable = computed(() => this.availableBackofficeRoles().length > 0);

  /** The moderator role while someone other than `except` holds it — one per salle. */
  isRoleTaken(role: { key: string }, except: StaffMember | null = null): boolean {
    const holder = this.moderator()?.staff;
    return role.key === MODERATOR_ROLE_KEY && !!holder && holder.id !== except?.id;
  }

  /** What a role lets its logins do, worded like the team cards. */
  roleAccessSummary(roleId: string): string {
    const role = this.backofficeRoles().find((r) => r.id === roleId);
    return role ? this.permissionSummary({ staff: { permissions: role.permissions } } as TeamMember) : "";
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly coachesService: CoachesService,
    private readonly staffService: StaffService,
    private readonly auth: AuthService,
    private readonly config: ConfigurationService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly translate: TranslateService,
    private readonly route: ActivatedRoute
  ) {
    // Reset to the first page whenever the filter (tab or search) changes.
    effect(() => {
      this.tab();
      this.search();
      this.page.set(1);
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.load();
    const q = this.route.snapshot.queryParamMap;
    if (q.get("action") === "new") {
      this.openCreate(q.get("type") === "backoffice" && this.isAdmin() ? "backoffice" : "coach");
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    forkJoin({
      coaches: this.coachesService.list(),
      staff: this.isAdmin() ? this.staffService.list() : of({ staff: [] as StaffMember[] }),
    }).subscribe({
      next: (res) => {
        this.coaches.set(res.coaches.coaches);
        this.staff.set(res.staff.staff);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  // ---- create ----
  openCreate(kind: CreateKind = "coach"): void {
    this.createKind.set(this.isAdmin() && !(kind === "backoffice" && !this.backofficeAvailable()) ? kind : "coach");
    this.createError.set(null);
    this.coachForm.reset({ with_mobile: false });
    this.backofficeForm.reset({ role_id: this.availableBackofficeRoles()[0]?.id ?? "" });
    this.createOpen.set(true);
  }

  /** From the create drawer: free the moderator role, then switch to the back-office form on it. */
  freeBackofficeSeat(member: TeamMember): void {
    this.deactivate(member, () => {
      this.createKind.set("backoffice");
      const moderatorRole = this.backofficeRoles().find((r) => r.key === MODERATOR_ROLE_KEY);
      if (moderatorRole) this.backofficeForm.controls.role_id.setValue(moderatorRole.id);
    });
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  submitCreate(): void {
    if (this.createKind() === "coach") this.submitCreateCoach();
    else this.submitCreateBackoffice();
  }

  private submitCreateCoach(): void {
    const v = this.coachForm.getRawValue();
    if (this.coachForm.controls.first_name.invalid || this.coachForm.controls.last_name.invalid) {
      this.coachForm.markAllAsTouched();
      return;
    }
    if (v.with_mobile && (!v.email || v.password.length < 8)) {
      this.createError.set(this.translate.instant("team.mobile_needs_credentials"));
      return;
    }

    this.saving.set(true);
    this.createError.set(null);
    this.coachesService
      .create({ first_name: v.first_name, last_name: v.last_name, email: v.email || undefined, phone: v.phone || undefined, birthdate: v.birthdate || null, bio: v.bio || undefined })
      .subscribe({
        next: (res) => {
          if (v.with_mobile) {
            this.coachesService.setLogin(res.coach.id, v.email, v.password).subscribe({
              next: () => this.afterCreate(),
              error: (err) => this.createFailed(err),
            });
          } else {
            this.afterCreate();
          }
        },
        error: (err) => this.createFailed(err),
      });
  }

  private submitCreateBackoffice(): void {
    if (this.backofficeForm.invalid) {
      this.backofficeForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.createError.set(null);
    const v = this.backofficeForm.getRawValue();
    this.staffService
      .create({ first_name: v.first_name, last_name: v.last_name, email: v.email, phone: v.phone || undefined, password: v.password, role_id: v.role_id, birthdate: v.birthdate || null })
      .subscribe({
        next: () => this.afterCreate(),
        error: (err) => this.createFailed(err),
      });
  }

  private afterCreate(): void {
    this.saving.set(false);
    this.createOpen.set(false);
    this.toast.success(this.translate.instant("common.save"));
    this.load();
  }

  private createFailed(err: unknown): void {
    this.saving.set(false);
    this.createError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
  }

  // ---- edit coach profile ----
  openEditCoach(coach: Coach): void {
    this.editingCoach.set(coach);
    this.editCoachForm.setValue({
      first_name: coach.first_name,
      last_name: coach.last_name,
      email: coach.email || "",
      phone: coach.phone || "",
      birthdate: coach.birthdate || "",
      bio: coach.bio || "",
    });
    this.editCoachError.set(null);
    this.editCoachOpen.set(true);
    // Lists carry e-mails masked (ex****le@gmail.com): the form takes the
    // whole address from the coach's own record, which the admin sees whole.
    this.coachesService.get(coach.id).subscribe({
      next: ({ coach: full }) => {
        if (this.editingCoach()?.id === coach.id) this.editCoachForm.patchValue({ email: full.email || "" });
      },
    });
  }

  submitEditCoach(): void {
    const coach = this.editingCoach();
    if (!coach || this.editCoachForm.invalid) {
      this.editCoachForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.editCoachError.set(null);
    // A still-masked address (the whole one did not load) is left out, so it
    // is never sent back over the real one — the backend would refuse it.
    const raw = this.editCoachForm.getRawValue();
    const payload = isMaskedEmail(raw.email) ? { ...raw, email: undefined } : raw;
    this.coachesService.update(coach.id, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.editCoachOpen.set(false);
        this.toast.success(this.translate.instant("common.save"));
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.editCoachError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // ---- role & web access ----
  openRole(staff: StaffMember): void {
    this.editingStaff.set(staff);
    this.roleForm.setValue({
      role_id: this.backofficeRoles().find((r) => r.key === staff.role_key)?.id ?? "",
      active: staff.active,
      birthdate: staff.birthdate || "",
    });
    this.roleError.set(null);
    this.roleOpen.set(true);
  }

  submitRole(): void {
    const staff = this.editingStaff();
    if (!staff || this.roleForm.invalid) return;
    this.saving.set(true);
    this.roleError.set(null);
    this.staffService.update(staff.id, this.roleForm.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false);
        this.roleOpen.set(false);
        this.toast.success(this.translate.instant("common.save"));
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.roleError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // ---- mobile login ----
  openLogin(coach: Coach): void {
    this.loginTarget.set(coach);
    this.loginForm.setValue({ email: coach.login_email || coach.email || "", password: "" });
    this.loginError.set(null);
    this.loginOpen.set(true);
    // Same as the edit form: the whole address comes from the coach's record.
    this.coachesService.get(coach.id).subscribe({
      next: ({ coach: full }) => {
        if (this.loginTarget()?.id === coach.id) this.loginForm.patchValue({ email: full.login_email || full.email || "" });
      },
    });
  }

  submitLogin(): void {
    const coach = this.loginTarget();
    if (!coach || this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    const { email, password } = this.loginForm.getRawValue();
    if (isMaskedEmail(email)) {
      this.loginError.set(this.translate.instant("common.email_type_full"));
      return;
    }
    this.saving.set(true);
    this.loginError.set(null);
    this.coachesService.setLogin(coach.id, email, password).subscribe({
      next: () => {
        this.saving.set(false);
        this.loginOpen.set(false);
        this.toast.success(this.translate.instant("coaches.login_set"));
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.loginError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // ---- deactivate ----
  async deactivate(member: TeamMember, onDone?: () => void): Promise<void> {
    const ok = await this.confirm.ask({
      title: this.translate.instant("team.deactivate_confirm_title"),
      body: this.translate.instant("team.deactivate_confirm_body"),
      confirmLabel: this.translate.instant("common.deactivate"),
      danger: true,
    });
    if (!ok) return;

    const req: Observable<unknown> = member.coach
      ? this.coachesService.deactivate(member.coach.id)
      : this.staffService.update(member.staff!.id, { active: false });

    req.subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.deactivate"));
        this.load();
        onDone?.();
      },
      error: (err: unknown) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }
}
