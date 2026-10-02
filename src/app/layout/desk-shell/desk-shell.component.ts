import { AfterViewInit, Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { debounceTime, distinctUntilChanged, Subject, switchMap } from "rxjs";
import { AuthService } from "../../core/auth/auth.service";
import { Client } from "../../core/models/client.model";
import { BrandingService } from "../../core/services/branding.service";
import { ClientsService } from "../../core/services/clients.service";
import { CompanyService } from "../../core/services/company.service";
import { ThemeService } from "../../core/services/theme.service";
import { AvatarComponent } from "../../shared/components/avatar.component";

interface DeskNavItem {
  path: string;
  icon: string;
  labelKey: string;
}

/**
 * The front desk.
 *
 * Every other shell is organised around what the software can do. This one is
 * organised around the person standing at the counter, so the search field is
 * not a feature on a members page — it is the top of every screen, focused on
 * load, and typing a name is how nearly every task here starts.
 *
 * Deliberately absent: the activity and plan catalogues, the team, the
 * company settings, and anything that totals up what the gym earns. Taking a
 * payment at the desk is the job; reading the revenue is not (see the
 * `payments` / `revenue` split in Permission::CATALOG).
 *
 * Built for a counter tablet first: one column, large targets, no hover-only
 * affordances.
 */
@Component({
  selector: "app-desk-shell",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslateModule, FormsModule, AvatarComponent],
  templateUrl: "./desk-shell.component.html",
  styleUrl: "./desk-shell.component.scss",
})
export class DeskShellComponent implements AfterViewInit {
  @ViewChild("searchInput") private searchInput?: ElementRef<HTMLInputElement>;

  readonly userMenuOpen = signal(false);
  readonly query = signal("");
  readonly results = signal<Client[]>([]);
  readonly searching = signal(false);
  readonly resultsOpen = signal(false);

  readonly navItems: DeskNavItem[] = [
    { path: "/desk/dashboard", icon: "bi-house", labelKey: "desk.nav.today" },
    { path: "/desk/checkin", icon: "bi-check2-square", labelKey: "desk.nav.checkin" },
    { path: "/admin/clients", icon: "bi-people", labelKey: "desk.nav.members" },
    { path: "/admin/calendar", icon: "bi-calendar3", labelKey: "desk.nav.schedule" },
    { path: "/admin/contracts", icon: "bi-award", labelKey: "desk.nav.subscriptions" },
    { path: "/admin/payments", icon: "bi-cash-coin", labelKey: "desk.nav.payments" },
  ];

  private readonly typed = new Subject<string>();
  private readonly companies = inject(CompanyService);

  /**
   * The salles this moderator is posted to, once there is more than one to
   * choose from — the admin posts them from "Mes salles".
   */
  readonly salles = computed(() => {
    const companies = this.auth.currentUser()?.companies;
    return companies && companies.length > 1 ? companies : null;
  });
  readonly activeSalle = computed(() => this.salles()?.find((c) => c.active) ?? null);
  readonly switching = signal(false);

  constructor(
    readonly auth: AuthService,
    readonly theme: ThemeService,
    readonly branding: BrandingService,
    private readonly clients: ClientsService,
    private readonly router: Router
  ) {
    this.branding.load();

    this.typed
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          this.searching.set(true);
          return this.clients.list({ search: term, per_page: 6 });
        })
      )
      .subscribe({
        next: (response) => {
          this.results.set(response.clients);
          this.searching.set(false);
          this.resultsOpen.set(true);
        },
        // A failed lookup empties the list rather than stranding the last
        // person's results under someone else's name.
        error: () => {
          this.results.set([]);
          this.searching.set(false);
        },
      });
  }

  ngAfterViewInit(): void {
    // Search-first means the cursor is already there. Skipped on a touch
    // device, where focusing on load throws up the keyboard over the screen
    // the person is trying to read.
    if (!matchMedia("(hover: none)").matches) {
      this.searchInput?.nativeElement.focus();
    }
  }

  onSearch(term: string): void {
    this.query.set(term);

    if (term.trim().length < 2) {
      this.results.set([]);
      this.resultsOpen.set(false);
      return;
    }

    this.typed.next(term.trim());
  }

  open(client: Client): void {
    this.clear();
    this.router.navigate(["/admin/clients", client.id]);
  }

  clear(): void {
    this.query.set("");
    this.results.set([]);
    this.resultsOpen.set(false);

    if (this.searchInput) this.searchInput.nativeElement.value = "";
  }

  @HostListener("document:keydown.escape")
  onEsc(): void {
    this.clear();
    this.userMenuOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
  }

  // A full reload: everything on screen, and the role this login holds,
  // belongs to the salle it was working in.
  switchSalle(id: string): void {
    if (this.switching() || id === this.activeSalle()?.id) {
      this.userMenuOpen.set(false);
      return;
    }

    this.switching.set(true);
    this.companies.switchTo(id).subscribe({
      next: () => this.reloadToHome(),
      error: () => {
        this.switching.set(false);
        this.userMenuOpen.set(false);
      },
    });
  }

  // Its own method so tests have a seam: window.location cannot be stubbed.
  protected reloadToHome(): void {
    window.location.assign("/");
  }
}
