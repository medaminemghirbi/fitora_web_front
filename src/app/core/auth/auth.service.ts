import { HttpClient } from "@angular/common/http";
import { Injectable, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Observable, map, tap } from "rxjs";
import * as Sentry from "@sentry/angular";
import { ConfigurationService } from "../configuration/configuration.service";
import { API_BASE_URL } from "../models/api-config";
import { Client } from "../models/client.model";
import { User } from "../models/user.model";

const TOKEN_KEY = "fitora_token";
// Versioned: before v2 a cached user carried the previous role names, in
// which "admin" meant Fitora's superadmin. Read now, it would put Fitora's
// operator in a gym's shell until the next refresh, so an old cache is
// dropped and the person signs in again (see dropPreRenameSession).
const USER_KEY = "fitora_user_v2";
const CLIENT_KEY = "fitora_client";
const IMPERSONATOR_KEY = "fitora_impersonator_v2";
// Keys from before the role rename and from when the product was "Gymly".
const PRE_RENAME_KEYS = [
  "gymly_user",
  "gymly_impersonator",
  "gymly_token",
  "gymly_user_v2",
  "gymly_client",
  "gymly_impersonator_v2",
];

// One door, two kinds of account: a platform login (admin, staff, Fitora
// superadmin) or a member whose gym enabled their access. account_type says which
// came back, so nobody is asked who they are before signing in.
interface AuthResponse {
  token: string;
  account_type?: "user" | "client";
  user?: User;
  client?: Client;
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  locale?: string;
}

interface ImpersonatorStash {
  token: string;
  user: User;
  companyName: string;
}

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly currentUserSignal = signal<User | null>(this.readStoredUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAdmin = computed(() => this.currentUserSignal()?.role === "admin");
  readonly isSuperadmin = computed(() => this.currentUserSignal()?.role === "superadmin");
  readonly isStaff = computed(() => this.currentUserSignal()?.role === "staff");

  // A member signed in on their own app. Mutually exclusive with
  // currentUser — never both, see setSession.
  private readonly currentClientSignal = signal<Client | null>(this.readStoredClient());
  readonly currentClient = this.currentClientSignal.asReadonly();
  readonly isClient = computed(() => this.currentClientSignal() !== null);

  readonly isAuthenticated = computed(
    () => this.currentUserSignal() !== null || this.currentClientSignal() !== null
  );

  private readonly impersonatorStashSignal = signal<ImpersonatorStash | null>(this.readImpersonatorStash());
  readonly isImpersonating = computed(() => this.impersonatorStashSignal() !== null);
  readonly impersonatedCompanyName = computed(() => this.impersonatorStashSignal()?.companyName ?? null);

  /**
   * An admin who signed up and has not clicked the emailed link yet. Nothing
   * past sign-up opens for them — the backend refuses it with
   * `email_unverified` — so every route sends them to /confirmation-email.
   * A superadmin impersonating them is let through, as the backend does.
   */
  readonly emailConfirmationPending = computed(() => {
    const user = this.currentUserSignal();
    return user?.role === "admin" && user.email_verified === false && !this.isImpersonating();
  });

  // Configuration (company, branding, permissions, modules, subscription) is
  // owned by ConfigurationService and hydrated from GET /api/v1/bootstrap;
  // these delegate so callers that already inject AuthService keep working.
  private readonly config = inject(ConfigurationService);
  readonly permissions = this.config.permissions;
  readonly activeRole = this.config.role;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {
    // Attributes any error caught after this to whoever it happened to — a
    // no-op call when Sentry was never initialized (no DSN, see main.ts), so
    // this is safe to always run.
    const client = this.currentClientSignal();
    if (client) {
      Sentry.setUser({ id: client.id, email: client.email ?? undefined });
    } else {
      this.syncSentryUser(this.currentUserSignal());
    }
  }

  private syncSentryUser(user: User | null): void {
    Sentry.setUser(user ? { id: user.id, email: user.email, company_id: user.company_id ?? undefined, role: user.role } : null);
  }

  /**
   * A gym opening its own account. Creates the admin's login and nothing
   * else — the gym itself is named on the next screen, which is also where
   * the 14 days start.
   */
  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${API_BASE_URL}/auth/register`, { user: payload })
      .pipe(tap((res) => this.setSession(res)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${API_BASE_URL}/auth/login`, { email, password })
      .pipe(tap((res) => this.setSession(res)));
  }

  // (Re)hydrate ConfigurationService from /bootstrap. Safe to call
  // repeatedly; failures leave the last known value in place. Skipped for a
  // platform superadmin — the /superadmin surface isn't tenant-scoped — but the superadmin
  // still gets the real-time system_update notification feed. Skipped for a
  // member too: /bootstrap is built entirely around current_user (role,
  // permissions) and holds nothing their app needs.
  loadConfiguration(): void {
    if (this.isClient()) {
      this.config.clear();
      return;
    }
    if (this.currentUserSignal()?.role === "superadmin") {
      this.config.clear();
      this.config.connectSuperadminNotifications();
      return;
    }
    // The cached user is whatever login answered, and nothing else rewrites
    // it: a salle opened (or a moderator posted) since would never reach the
    // navbar switcher. /bootstrap carries the live user, so it replaces it.
    this.config.load().subscribe({
      next: (bootstrap) => {
        if (bootstrap.user && bootstrap.user.id === this.currentUserSignal()?.id) this.storeUser(bootstrap.user);
      },
      error: () => {},
    });
  }

  hasPermission(key: string): boolean {
    const user = this.currentUserSignal();
    if (!user) return false;
    if (user.role === "superadmin") return true;
    return this.config.hasPermission(key);
  }

  /**
   * Whether this tenant has the feature turned on.
   *
   * A different question from hasPermission: this says what the product
   * OFFERS here, not who may use it. Both are asked, and both are asked
   * again on the backend.
   */
  hasFeature(key: string): boolean {
    return this.config.features()[key] === true;
  }

  /** Drops the session without leaving the page. */
  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(CLIENT_KEY);
    this.currentUserSignal.set(null);
    this.currentClientSignal.set(null);
    this.syncSentryUser(null);
    this.config.clear();
  }

  logout(): void {
    // Logging out of an impersonated session should drop back to the superadmin
    // account that started it, not destroy that superadmin's session too — the
    // explicit "exit impersonation" banner action does the same thing, this
    // just makes the ordinary logout button behave sanely in that context.
    if (this.isImpersonating()) {
      this.exitImpersonation();
      return;
    }

    this.clearSession();
    this.router.navigate(["/connexion"]);
  }

  // Called by the superadmin companies page after POST .../impersonate
  // succeeds — stashes the superadmin's own session so it can be restored, then
  // switches to the impersonated admin's session.
  startImpersonation(res: AuthResponse, companyName: string): void {
    const token = this.getToken();
    const user = this.currentUserSignal();
    if (token && user) {
      const stash: ImpersonatorStash = { token, user, companyName };
      localStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(stash));
      this.impersonatorStashSignal.set(stash);
    }
    this.setSession(res);
    this.router.navigate(["/admin/dashboard"]);
  }

  exitImpersonation(): void {
    const stash = this.impersonatorStashSignal();
    if (!stash) return;

    localStorage.removeItem(IMPERSONATOR_KEY);
    this.impersonatorStashSignal.set(null);
    this.setSession({ token: stash.token, user: stash.user });
    this.router.navigate(["/superadmin/overview"]);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * For someone signed in. A new password ends every other session; this
   * one gets a fresh token back and keeps going. Works for a member too.
   */
  changePassword(currentPassword: string, password: string): Observable<void> {
    return this.http
      .patch<{ token: string }>(`${API_BASE_URL}/auth/password`, { current_password: currentPassword, password })
      .pipe(
        tap((res) => localStorage.setItem(TOKEN_KEY, res.token)),
        map(() => undefined)
      );
  }

  /** Ends every session on every device, this one included. */
  signOutEverywhere(): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/auth/logout`, { all_devices: true }).pipe(
      tap(() => {
        this.clearSession();
        this.router.navigate(["/connexion"]);
      })
    );
  }

  homeRouteForCurrentUser(): string {
    if (this.isClient()) return "/member/home";
    const user = this.currentUserSignal();
    if (user?.role === "superadmin") return "/superadmin/overview";
    // The address first: nothing else opens until it is confirmed.
    if (this.emailConfirmationPending()) return "/confirmation-email";
    // Anyone who coaches uses the dedicated coach shell ("My schedule" /
    // attendance) — whatever their role happens to be called.
    if (user?.is_coach) return "/coach/today";
    // Staff who check people in and book them work the front desk, which has
    // a shell of its own. The admin is deliberately not sent here: their
    // shell already does all of this and more.
    if (this.deskShellApplies()) return "/desk/dashboard";
    // A freshly-signed-up admin lands in the setup flow until it is done (or
    // they leave it). Read from the bootstrap payload rather than
    // OnboardingService: this runs before any page has loaded one.
    const onboarding = this.config.onboarding();
    if (user?.role === "admin" && onboarding && !onboarding.complete && !onboarding.dismissed) {
      return "/admin/onboarding";
    }
    // The dashboard needs only the base `reports` permission — the safe
    // universal landing for every other role.
    return "/admin/dashboard";
  }

  // Whether this login should use the dedicated coach shell.
  coachShellApplies(): boolean {
    return this.currentUserSignal()?.is_coach === true;
  }

  /**
   * Whether this login works the front desk.
   *
   * Checking people in AND booking them — `checkin` alone is a coach. Mirrors
   * deskAreaGuard, which is what actually enforces it.
   */
  deskShellApplies(): boolean {
    const user = this.currentUserSignal();
    if (!user || user.role !== "staff" || user.is_coach) return false;

    return this.hasPermission("checkin") && this.hasPermission("bookings");
  }

  // Re-fetches the current user — used after an action that changes something
  // the cached user object doesn't auto-update for, e.g. creating an
  // company (company_id is only known once one exists).
  refreshCurrentUser(): Observable<User> {
    return this.fetchCurrentUser().pipe(tap(() => this.loadConfiguration()));
  }

  /**
   * The same re-fetch without re-hydrating the configuration — cheap enough
   * for the "check your inbox" screen to ask every few seconds whether the
   * link has been clicked yet.
   */
  fetchCurrentUser(): Observable<User> {
    return this.http.get<{ user: User }>(`${API_BASE_URL}/auth/me`).pipe(
      map((res) => res.user),
      tap((user) => this.storeUser(user))
    );
  }

  private storeUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUserSignal.set(user);
  }

  private setSession(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);

    if (res.account_type === "client" && res.client) {
      localStorage.removeItem(USER_KEY);
      localStorage.setItem(CLIENT_KEY, JSON.stringify(res.client));
      this.currentUserSignal.set(null);
      this.currentClientSignal.set(res.client);
      Sentry.setUser({ id: res.client.id, email: res.client.email ?? undefined });
    } else if (res.user) {
      localStorage.removeItem(CLIENT_KEY);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      this.currentClientSignal.set(null);
      this.currentUserSignal.set(res.user);
      this.syncSentryUser(res.user);
    }

    this.loadConfiguration();
  }

  private readStoredClient(): Client | null {
    const raw = localStorage.getItem(CLIENT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Client;
    } catch {
      return null;
    }
  }

  private readStoredUser(): User | null {
    this.dropPreRenameSession();
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  /** A session cached before the role rename: signed out, cleanly. */
  private dropPreRenameSession(): void {
    if (!PRE_RENAME_KEYS.some((key) => localStorage.getItem(key) !== null)) return;

    PRE_RENAME_KEYS.forEach((key) => localStorage.removeItem(key));
    if (localStorage.getItem(USER_KEY) === null) localStorage.removeItem(TOKEN_KEY);
  }

  private readImpersonatorStash(): ImpersonatorStash | null {
    const raw = localStorage.getItem(IMPERSONATOR_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ImpersonatorStash;
    } catch {
      return null;
    }
  }
}
