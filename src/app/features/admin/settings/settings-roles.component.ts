import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { forkJoin } from "rxjs";
import { Role } from "../../../core/models/role.model";
import { RolesService } from "../../../core/services/roles.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { ConfigurationService } from "../../../core/configuration/configuration.service";

export interface PermGroup {
  id: string;
  keys: string[];
}

// The permission catalogue, grouped by the part of the gym it touches. A key
// the backend adds that isn't listed here lands in a trailing "other" group,
// so a new permission is never silently hidden.
const PERM_GROUPS: PermGroup[] = [
  { id: "front", keys: ["clients", "checkin", "bookings"] },
  { id: "planning", keys: ["sessions", "activities", "coaches", "spaces"] },
  { id: "sales", keys: ["contracts", "contract_types", "payments"] },
  { id: "insights", keys: ["reports", "revenue"] },
];

// Flagged in the matrix: prices, money totals and who coaches.
const SENSITIVE_PERMISSIONS = new Set(["coaches", "contract_types", "revenue"]);

// What `require_admin!` keeps for the admin whatever a role holds — shown so
// nobody hunts for a box that can't exist.
export const ADMIN_RESERVED = ["settings", "accounts", "salles", "subscription", "refunds", "member_removal", "exports"];

/** A tick box's state for a whole group in one role's column. */
export type GroupState = "all" | "some" | "none";

/**
 * Rôles & permissions as one matrix (2026-10-10, mockup "1 — Matrice"):
 * a row per permission, grouped; a column per role; a box where they cross.
 * Every role is compared at a glance and edited in place; edits across
 * several roles are saved together.
 *
 * The admin's column is always full and locked. Built-in roles keep their
 * name; custom ones can be renamed or deleted from their column header. A
 * new role is a new column (named in a small dialog, created empty).
 */
@Component({
  selector: "app-settings-roles",
  standalone: true,
  imports: [FormsModule, RouterLink, TranslateModule, SkeletonComponent, ErrorStateComponent, ModalComponent],
  templateUrl: "./settings-roles.component.html",
  styleUrl: "./settings-roles.component.scss",
})
export class SettingsRolesComponent implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly config = inject(ConfigurationService);

  readonly reserved = ADMIN_RESERVED;

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly saving = signal(false);
  readonly roles = signal<Role[]>([]);
  readonly catalog = signal<Record<string, string>>({});
  /** Filters the permission rows. */
  readonly query = signal("");

  /** Each editable role's ticked permissions, as edited (role id → keys). */
  readonly drafts = signal<Record<string, Set<string>>>({});

  // The name dialog: a new role, or renaming a custom one.
  readonly nameDialog = signal<{ mode: "create" | "rename"; role: Role | null } | null>(null);
  readonly draftName = signal("");
  readonly nameError = signal<string | null>(null);
  readonly savingName = signal(false);

  readonly catalogKeys = computed(() => Object.keys(this.catalog()));
  readonly totalPerms = computed(() => this.catalogKeys().length);

  /** Columns: the admin first, then the other built-in roles, then custom ones. */
  readonly columns = computed(() => {
    const rank = (r: Role) => (r.key === "admin" ? 0 : r.builtin ? 1 : 2);
    return [...this.roles()].sort((a, b) => rank(a) - rank(b));
  });

  readonly groups = computed<PermGroup[]>(() => {
    const keys = this.catalogKeys();
    const q = this.query().trim().toLowerCase();
    const matches = (k: string) => !q || this.permLabel(k).toLowerCase().includes(q) || this.permHint(k).toLowerCase().includes(q);
    const known = new Set(PERM_GROUPS.flatMap((g) => g.keys));
    const groups = PERM_GROUPS.map((g) => ({ id: g.id, keys: g.keys.filter((k) => keys.includes(k) && matches(k)) }));
    groups.push({ id: "other", keys: keys.filter((k) => !known.has(k) && matches(k)) });
    return groups.filter((g) => g.keys.length > 0);
  });

  /** One per box flipped against what is saved, across every role. */
  readonly changeCount = computed(() => {
    const drafts = this.drafts();
    let n = 0;
    for (const role of this.roles()) {
      const draft = drafts[role.id];
      if (!draft || this.isLocked(role)) continue;
      const saved = new Set(role.permissions);
      draft.forEach((k) => saved.has(k) || n++);
      saved.forEach((k) => draft.has(k) || n++);
    }
    return n;
  });
  readonly dirty = computed(() => this.changeCount() > 0);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.rolesService.list().subscribe({
      next: (res) => {
        this.roles.set(res.roles);
        this.catalog.set(res.permission_catalog);
        this.drafts.set(Object.fromEntries(res.roles.map((r) => [r.id, new Set(r.permissions)])));
        // The team page's role pickers read the bootstrap copy: keep it current
        // so a role created here is assignable there without a reload.
        this.config.setRoles(res.roles);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  // ---- reading the matrix ---------------------------------------------------

  /** The admin's column: always full, never edited. */
  isLocked(role: Role): boolean {
    return role.key === "admin";
  }

  isOn(role: Role, key: string): boolean {
    return this.isLocked(role) || !!this.drafts()[role.id]?.has(key);
  }

  /** Whether this box differs from what is saved — marked until saved. */
  isChanged(role: Role, key: string): boolean {
    if (this.isLocked(role)) return false;
    return this.isOn(role, key) !== role.permissions.includes(key);
  }

  groupState(role: Role, group: PermGroup): GroupState {
    const n = group.keys.filter((k) => this.isOn(role, k)).length;
    return n === group.keys.length ? "all" : n === 0 ? "none" : "some";
  }

  roleCount(role: Role): number {
    if (this.isLocked(role)) return this.totalPerms();
    const draft = this.drafts()[role.id] ?? new Set(role.permissions);
    return this.catalogKeys().filter((k) => draft.has(k)).length;
  }

  permLabel(key: string): string {
    const i18n = this.translate.instant(`settings.perm_${key}`);
    return i18n === `settings.perm_${key}` ? this.catalog()[key] ?? key : i18n;
  }

  permHint(key: string): string {
    const i18n = this.translate.instant(`settings.perm_hint_${key}`);
    return i18n === `settings.perm_hint_${key}` ? "" : i18n;
  }

  isSensitive(key: string): boolean {
    return SENSITIVE_PERMISSIONS.has(key);
  }

  /** The admin role holds the owner, who is no staff account — so no count of 0. */
  accountsLabel(role: Role): string {
    if (role.key === "admin") return this.translate.instant("settings.role_accounts_owner");
    const n = role.staff_count;
    if (n === 0) return this.translate.instant("settings.role_accounts_none");
    return this.translate.instant(n === 1 ? "settings.role_accounts_one" : "settings.role_accounts_many", { count: n });
  }

  /** Only the built-in moderator role is capped (one active login per salle). */
  isCappedRole(role: Role): boolean {
    return role.key === "moderator";
  }

  // ---- editing --------------------------------------------------------------

  toggle(role: Role, key: string): void {
    if (this.isLocked(role)) return;
    this.drafts.update((drafts) => {
      const next = new Set(drafts[role.id] ?? role.permissions);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...drafts, [role.id]: next };
    });
  }

  /** Ticks the whole group for the role, or clears it once it is all ticked. */
  toggleGroup(role: Role, group: PermGroup): void {
    if (this.isLocked(role)) return;
    const clear = this.groupState(role, group) === "all";
    this.drafts.update((drafts) => {
      const next = new Set(drafts[role.id] ?? role.permissions);
      group.keys.forEach((k) => (clear ? next.delete(k) : next.add(k)));
      return { ...drafts, [role.id]: next };
    });
  }

  reset(): void {
    this.drafts.set(Object.fromEntries(this.roles().map((r) => [r.id, new Set(r.permissions)])));
  }

  /** Saves every role whose boxes changed, together. */
  save(): void {
    const drafts = this.drafts();
    const changed = this.roles().filter((role) => {
      if (this.isLocked(role)) return false;
      const draft = drafts[role.id];
      const saved = new Set(role.permissions);
      return !!draft && (draft.size !== saved.size || [...draft].some((k) => !saved.has(k)));
    });
    if (!changed.length) return;

    this.saving.set(true);
    forkJoin(
      changed.map((role) =>
        this.rolesService.update(role.id, { permissions: this.catalogKeys().filter((k) => drafts[role.id].has(k)) })
      )
    ).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.translate.instant("settings.role_saved"));
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // ---- adding, renaming, removing a role -------------------------------------

  /** Leaving unsaved boxes behind asks first (a reload would drop them). */
  private async canLeave(): Promise<boolean> {
    if (!this.dirty()) return true;
    return this.confirm.ask({
      title: this.translate.instant("settings.role_discard_title"),
      body: this.translate.instant("settings.role_discard_body"),
      confirmLabel: this.translate.instant("settings.role_discard_confirm"),
      danger: true,
    });
  }

  async startCreate(): Promise<void> {
    if (!(await this.canLeave())) return;
    this.openNameDialog("create", null);
  }

  async startRename(role: Role): Promise<void> {
    if (role.builtin) return;
    if (!(await this.canLeave())) return;
    this.openNameDialog("rename", role);
  }

  private openNameDialog(mode: "create" | "rename", role: Role | null): void {
    this.draftName.set(role?.name ?? "");
    this.nameError.set(null);
    this.nameDialog.set({ mode, role });
  }

  closeNameDialog(): void {
    this.nameDialog.set(null);
  }

  submitName(): void {
    const dialog = this.nameDialog();
    if (!dialog) return;
    const name = this.draftName().trim();
    if (!name) {
      this.nameError.set(this.translate.instant("settings.role_name_required"));
      return;
    }
    this.savingName.set(true);
    this.nameError.set(null);
    const req =
      dialog.mode === "rename" && dialog.role
        ? this.rolesService.update(dialog.role.id, { name })
        : this.rolesService.create({ name, permissions: [] });

    req.subscribe({
      next: () => {
        this.savingName.set(false);
        this.nameDialog.set(null);
        this.toast.success(this.translate.instant("settings.role_saved"));
        this.load();
      },
      error: (err) => {
        this.savingName.set(false);
        this.nameError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  async remove(role: Role): Promise<void> {
    if (!role.deletable) return;
    if (!(await this.canLeave())) return;
    const ok = await this.confirm.ask({
      title: this.translate.instant("settings.role_delete_title", { name: role.name }),
      body: this.translate.instant("settings.role_delete_body"),
      danger: true,
    });
    if (!ok) return;
    this.rolesService.delete(role.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.delete"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }
}
