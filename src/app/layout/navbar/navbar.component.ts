import { Component, HostListener, Input, computed, inject, signal } from "@angular/core";
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from "@angular/router";
import { filter } from "rxjs";
import { TranslateModule } from "@ngx-translate/core";
import { AuthService } from "../../core/auth/auth.service";
import { ConfigurationService } from "../../core/configuration/configuration.service";
import { NavGroup, NavLeaf } from "../../core/configuration/navigation.service";
import { CommandPaletteService } from "../../core/services/command-palette.service";
import { CompanyService } from "../../core/services/company.service";
import { ThemeService } from "../../core/services/theme.service";
import { AvatarComponent } from "../../shared/components/avatar.component";
import { NotificationBellComponent } from "../notifications/notification-bell.component";

/**
 * Top navigation bar — replaces the dark sidebar for every shell.
 * Admin: grouped dropdown menus (from NavigationService). Coach / superadmin:
 * a flat list of links via [flatItems].
 */
@Component({
  selector: "app-navbar",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslateModule, AvatarComponent, NotificationBellComponent],
  templateUrl: "./navbar.component.html",
  styleUrl: "./navbar.component.scss",
})
export class NavbarComponent {
  @Input() dashboardItem: NavLeaf | null = null;
  @Input() groups: NavGroup[] = [];
  @Input() flatItems: NavLeaf[] = [];
  @Input() secondaryItems: NavLeaf[] = [];
  @Input() brandName = "Fitora";
  @Input() brandLogoUrl: string | null = null;
  @Input() brandHome = "/admin/dashboard";
  @Input() brandSuffix: string | null = null;
  @Input() showActions = true;
  @Input() showNotifications = false;
  // Set to false when the surrounding shell already renders the brand mark
  // and the full desktop nav. The mobile burger + panel still read
  // [dashboardItem]/[groups]/[flatItems] either way.
  @Input() showBrand = true;
  @Input() showDesktopNav = true;
  // Admin-only shortcut to the modules marketplace — pre-order a module,
  // see the current debt, ask for help. Rendered as a visible button rather
  // than buried in the user dropdown since it's meant to be found fast.
  @Input() showSupport = false;

  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly palette = inject(CommandPaletteService);
  private readonly companyService = inject(CompanyService);
  private readonly config = inject(ConfigurationService);
  private readonly router = inject(Router);

  /**
   * Hidden while scrolling down, back on the first scroll up.
   *
   * Reading a long list should not cost 64px of every screen, and reaching
   * the search should not cost a scroll to the top. Always visible near the
   * top of the page, so the bar cannot get stuck away.
   */
  readonly hidden = signal(false);

  /** Where the last scroll left us, to tell up from down. */
  private lastScrollY = 0;
  private scrollQueued = false;

  /** Below this the bar always shows: there is nothing to gain from hiding. */
  private static readonly REVEAL_ABOVE = 80;

  readonly openGroup = signal<string | null>(null);
  readonly userMenuOpen = signal(false);
  readonly mobileOpen = signal(false);
  readonly companySwitcherOpen = signal(false);
  readonly switching = signal(false);

  /**
   * Scroll arrives far faster than a frame; the reaction is coalesced into
   * one rAF so a fling does not queue hundreds of signal writes.
   */
  @HostListener("window:scroll")
  onWindowScroll(): void {
    if (this.scrollQueued) return;
    this.scrollQueued = true;

    requestAnimationFrame(() => {
      this.scrollQueued = false;
      const y = Math.max(0, window.scrollY);

      // A menu that is open belongs to a bar you can still see.
      if (y <= NavbarComponent.REVEAL_ABOVE || this.anyMenuOpen()) {
        this.hidden.set(false);
      } else {
        this.hidden.set(y > this.lastScrollY);
      }

      this.lastScrollY = y;
    });
  }

  private anyMenuOpen(): boolean {
    return this.openGroup() !== null || this.userMenuOpen() || this.companySwitcherOpen() || this.mobileOpen();
  }

  /**
   * The salles this login can move between. An admin always sees the
   * switcher — it is also their way to "Mes salles", where another salle is
   * opened. A moderator sees it once they are posted to more than one.
   */
  readonly switchableCompanies = computed(() => {
    const user = this.auth.currentUser();
    const companies = user?.companies;
    if (!companies?.length) return null;
    return user?.role === "admin" || companies.length > 1 ? companies : null;
  });
  /**
   * Several salles are a Pro tool (paid Pro only, locked on the trial): the menu, moving
   * between salles and "Gérer mes salles". On Starter the menu is locked —
   * it lists what there is and points at Pro. Open until the plan is known;
   * the backend refuses on Starter anyway.
   */
  readonly proFeatures = this.config.proFeatures;
  readonly canSwitch = computed(() => (this.switchableCompanies()?.length ?? 0) > 1 && this.proFeatures());
  readonly switchLocked = computed(() => !!this.switchableCompanies() && !this.proFeatures());
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === "admin");
  readonly activeCompany = computed(() => this.switchableCompanies()?.find((c) => c.active) ?? null);

  private readonly activeUrl = signal(this.router.url);
  private readonly allLeaves = computed<NavLeaf[]>(() => [
    ...(this.dashboardItem ? [this.dashboardItem] : []),
    ...this.groups.flatMap((g) => g.items),
    ...this.flatItems,
    ...this.secondaryItems,
  ]);
  /** Current page label — shown next to the hamburger on mobile. */
  readonly activePageLabel = computed(() => {
    const clean = this.activeUrl().split("?")[0].split("#")[0];
    const match = this.allLeaves()
      .filter((i) => clean.startsWith(i.path))
      .sort((a, b) => b.path.length - a.path.length)[0];
    return match ? match.labelKey : null;
  });
  /** Which group holds the active route — highlights the group button. */
  readonly activeGroupId = computed(() => {
    const clean = this.activeUrl().split("?")[0].split("#")[0];
    return this.groups.find((g) => g.items.some((i) => clean.startsWith(i.path)))?.id ?? null;
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.activeUrl.set(e.urlAfterRedirects);
        this.closeAll();
        this.mobileOpen.set(false);
      });
  }

  /**
   * A group left with a single visible entry is shown as a plain link, not a
   * menu: "Équipe" (and "Finances", once permissions trim it) opened a
   * dropdown holding exactly one row, which was a click for nothing. Returns
   * that lone entry, or null when the group really needs a menu.
   */
  soloItem(group: NavGroup): NavLeaf | null {
    return group.items.length === 1 ? group.items[0] : null;
  }

  toggleGroup(id: string): void {
    this.openGroup.update((v) => (v === id ? null : id));
    this.userMenuOpen.set(false);
    this.companySwitcherOpen.set(false);
  }

  toggleCompanySwitcher(): void {
    this.companySwitcherOpen.update((v) => !v);
    this.openGroup.set(null);
    this.userMenuOpen.set(false);
  }

  // A full reload rather than a router navigation: every page's already-
  // loaded data (dashboard stats, client lists, whatever) belongs to the
  // company that was active when it fetched — switching needs a clean
  // slate everywhere, not just wherever this component thinks to refetch.
  switchCompany(companyId: string): void {
    if (this.switching() || !this.canSwitch() || companyId === this.activeCompany()?.id) {
      this.companySwitcherOpen.set(false);
      return;
    }

    this.switching.set(true);
    this.companyService.switchTo(companyId).subscribe({
      next: () => this.reloadToHome(),
      error: () => {
        this.switching.set(false);
        this.companySwitcherOpen.set(false);
      },
    });
  }

  logout(): void {
    this.auth.logout();
  }

  // Its own method purely so tests have a seam to spy on — real browsers
  // (and Karma's) don't reliably allow stubbing window.location itself.
  // A staff login's home depends on its role in the salle it lands in, so
  // the root route works it out once the new salle's bootstrap is in.
  protected reloadToHome(): void {
    window.location.assign(this.isAdmin() ? "/admin/dashboard" : "/");
  }

  private closeAll(): void {
    this.openGroup.set(null);
    this.userMenuOpen.set(false);
    this.companySwitcherOpen.set(false);
  }

  @HostListener("document:click", ["$event"])
  onDocClick(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest(".app-navbar-menu")) this.closeAll();
  }

  @HostListener("document:keydown.escape")
  onEsc(): void {
    this.closeAll();
    this.mobileOpen.set(false);
  }
}
