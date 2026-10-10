import { Injectable, computed, inject } from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";

export interface SettingsSection {
  /** Child route path under /admin/settings. */
  path: string;
  /** bootstrap-icons class. */
  icon: string;
  labelKey: string;
  descKey: string;
  /** Rail group this section belongs to. */
  group: "establishment" | "planning" | "hr" | "appearance";
  adminOnly?: boolean;
  permission?: string;
  /** A Pro tool: listed in the "Outils Pro" menu, locked on Starter and the trial. */
  pro?: boolean;
  /** One line under a Pro tool's name in that menu. */
  shortKey?: string;
}

export interface SettingsGroup {
  key: string;
  labelKey: string;
  sections: SettingsSection[];
}

const GROUP_ORDER: { key: SettingsSection["group"]; labelKey: string }[] = [
  { key: "establishment", labelKey: "settings.group_establishment" },
  { key: "planning", labelKey: "settings.group_planning" },
  { key: "hr", labelKey: "settings.group_hr" },
];

/**
 * Single source of truth for the settings sections — consumed by the shell
 * to build the left rail. Visibility mirrors the route guards (role /
 * permission).
 *
 * Only what a gym sets once belongs here. The catalogue (activities, plans)
 * moved out to /admin/contracts, next to the subscriptions it prices.
 */
@Injectable({ providedIn: "root" })
export class SettingsSectionsService {
  private readonly auth = inject(AuthService);

  private readonly all: SettingsSection[] = [
    { path: "company", icon: "bi-building", labelKey: "settings.nav_company", descKey: "settings.desc_company", group: "establishment", adminOnly: true },
    { path: "branding", icon: "bi-palette", labelKey: "settings.nav_branding", descKey: "settings.desc_branding", group: "establishment", adminOnly: true, pro: true, shortKey: "settings.short_branding" },
    // What every contract PDF carries — signature, signatory, terms. Every
    // plan's, so it is not under "Image de marque" (a Pro tool).
    { path: "contracts", icon: "bi-file-earmark-text", labelKey: "settings.nav_contracts", descKey: "settings.desc_contracts", group: "establishment", adminOnly: true },
    { path: "planning", icon: "bi-calendar3", labelKey: "settings.nav_planning", descKey: "settings.desc_planning", group: "planning", adminOnly: true },
    // How this gym books. The engine has enforced these rules all along;
    // until now nothing could set them, so every gym ran on the defaults.
    { path: "booking", icon: "bi-journal-check", labelKey: "settings.nav_booking", descKey: "settings.desc_booking", group: "planning", adminOnly: true },
    { path: "roles", icon: "bi-shield-lock", labelKey: "settings.nav_roles", descKey: "settings.desc_roles", group: "hr", adminOnly: true, pro: true, shortKey: "settings.short_roles" },
    { path: "data-exchange", icon: "bi-arrow-down-up", labelKey: "nav.data_exchange", descKey: "settings.desc_data_exchange", group: "establishment", adminOnly: true, pro: true, shortKey: "settings.short_data_exchange" },
    // The keys that make the Fitora app this salle's app (a Pro tool).
    { path: "mobile-app", icon: "bi-phone", labelKey: "settings.nav_mobile_app", descKey: "settings.desc_mobile_app", group: "establishment", adminOnly: true, pro: true, shortKey: "settings.short_mobile_app" },
  ];

  readonly sections = computed(() => this.all.filter((s) => this.isVisible(s)));

  readonly groupedSections = computed<SettingsGroup[]>(() => {
    const visible = this.sections();
    return GROUP_ORDER.map((g) => ({
      key: g.key,
      labelKey: g.labelKey,
      sections: visible.filter((s) => s.group === g.key),
    })).filter((g) => g.sections.length > 0);
  });

  /** Your own login: password, and signing out of every device. */
  private readonly accountSection: SettingsSection = {
    path: "account",
    icon: "bi-person-lock",
    labelKey: "settings.nav_account",
    descKey: "settings.desc_account",
    group: "appearance",
  };

  /** Appearance (language + theme) is a pseudo-section, always visible. */
  private readonly appearanceSection: SettingsSection = {
    path: "appearance",
    icon: "bi-circle-half",
    labelKey: "settings.appearance",
    descKey: "settings.desc_appearance",
    group: "appearance",
  };

  /**
   * Full nav for the Direction A rail: the visible grouped sections plus a
   * trailing "Apparence" group. Drives both the rail and the section panel.
   */
  readonly navGroups = computed<SettingsGroup[]>(() => [
    ...this.groupedSections(),
    { key: "appearance", labelKey: "settings.group_appearance", sections: [this.appearanceSection, this.accountSection] },
  ]);

  private isVisible(s: SettingsSection): boolean {
    if (this.auth.currentUser()?.role === "admin") return true;
    if (s.adminOnly) return false;
    if (!s.permission) return true;
    return this.auth.hasPermission(s.permission);
  }
}
