import { Component, ElementRef, HostListener, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { AuthService } from "../../../core/auth/auth.service";
import { SettingsSectionsService } from "./settings-sections";
import { SettingsCompanyComponent } from "./settings-company.component";
import { SettingsBrandingComponent } from "./settings-branding.component";
import { SettingsPlanningComponent } from "./settings-planning.component";
import { SettingsBookingComponent } from "./settings-booking.component";
import { SettingsRolesComponent } from "./settings-roles.component";
import { DataExchangeComponent } from "../data-exchange/data-exchange.component";
import { SettingsAppearanceComponent } from "./settings-appearance.component";
import { ChangePasswordComponent } from "../../../shared/ui/change-password.component";
import { ProLockComponent } from "../../../shared/ui/pro-lock.component";
import { SettingsMobileAppComponent } from "./settings-mobile-app.component";
import { ConfigurationService } from "../../../core/configuration/configuration.service";

// Direction A — persistent left rail + detail panel. The rail is flush to the
// left edge and full height; `/admin/settings/:section` selects the section
// shown on the right. Bare `/admin/settings` redirects to the first section.
@Component({
  selector: "app-settings-shell",
  standalone: true,
  imports: [
    RouterLink,
    TranslateModule,
    SettingsCompanyComponent,
    SettingsBrandingComponent,
    SettingsPlanningComponent,
    SettingsBookingComponent,
    SettingsRolesComponent,
    DataExchangeComponent,
    SettingsAppearanceComponent,
    ChangePasswordComponent,
    ProLockComponent,
    SettingsMobileAppComponent,
  ],
  templateUrl: "./settings-shell.component.html",
  styleUrl: "./settings-shell.component.scss",
})
export class SettingsShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly sectionsSvc = inject(SettingsSectionsService);
  /** Pro's tools open (paid Pro only)? Starter and the trial see them locked. */
  readonly proFeatures = inject(ConfigurationService).proFeatures;

  readonly navGroups = this.sectionsSvc.navGroups;

  /** Every section, in group order — the tab row reads this directly. */
  private readonly flat = computed(() =>
    this.navGroups().flatMap((g) => g.sections.map((s) => ({ ...s, groupLabelKey: g.labelKey })))
  );

  readonly flatSections = this.flat;

  /** The everyday sections, on the tab row. */
  readonly coreSections = computed(() => this.flat().filter((s) => !s.pro));
  /** The Pro tools, behind the "Outils Pro" menu. */
  readonly proSections = computed(() => this.flat().filter((s) => s.pro));
  readonly activeIsPro = computed(() => !!this.activeSection()?.pro);

  readonly proMenuOpen = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);

  toggleProMenu(event: Event): void {
    event.stopPropagation();
    this.proMenuOpen.update((open) => !open);
  }

  /** A click anywhere else, or Escape, closes the menu. */
  @HostListener("document:click", ["$event"])
  onDocumentClick(event: Event): void {
    if (this.proMenuOpen() && !this.host.nativeElement.querySelector(".settings-pro")?.contains(event.target as Node)) {
      this.proMenuOpen.set(false);
    }
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.proMenuOpen.set(false);
  }

  private readonly activePath = signal<string>("");
  readonly activeSection = computed(() => this.flat().find((s) => s.path === this.activePath()));

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === "admin";
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((pm) => {
      const requested = pm.get("section") ?? "";
      const known = this.flat().some((s) => s.path === requested);
      if (!known) {
        const first = this.flat()[0]?.path;
        if (first) this.router.navigate(["/admin/settings", first], { replaceUrl: true });
        return;
      }
      this.activePath.set(requested);
      window.scrollTo({ top: 0 });
    });
  }

  goto(path: string): void {
    if (path) this.router.navigate(["/admin/settings", path]);
  }
}
