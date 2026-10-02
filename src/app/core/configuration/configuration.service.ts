import { HttpClient } from "@angular/common/http";
import { Injectable, Injector, computed, inject, signal } from "@angular/core";
import { Observable, catchError, of, shareReplay, tap } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { Company } from "../models/company.model";
import { LockReason, PlanKey } from "../models/subscription.model";
import { OnboardingState } from "../models/onboarding.model";
import { MePermissions, User } from "../models/user.model";
import { BrandingService, CompanyBranding } from "../services/branding.service";
import { LocaleService } from "../services/locale.service";
import { NotificationService } from "../services/notification.service";

export interface BootstrapSubscription {
  /** The access itself. Nothing is computed to read it. */
  active: boolean;
  locked: boolean;
  lock_reason: LockReason;
  /** Whether the period we are in has been settled. */
  current_period_paid: boolean;
  /** Days left before access closes. null when nothing is ticking. */
  days_before_lock: number | null;
  /** On the free days signup gave away (or just past them). */
  trial: boolean;
  /** Free days left, today included. null outside a trial. */
  trial_days_left: number | null;
  /** The account's plan — the same for every salle it runs. */
  plan: PlanKey;
  /** Whether members can sign in to their app: Pro, or a free trial. */
  member_app: boolean;
  /** Whether the account may open another salle: Pro, or a free trial. */
  multi_salle: boolean;
}

export interface CompanyRole {
  id: string;
  key: string;
  name: string;
  permissions: string[];
  builtin: boolean;
}

export interface Bootstrap {
  user: User;
  company: Company | null;
  branding: CompanyBranding | null;
  role: MePermissions["role"];
  permissions: string[];
  modules: string[];
  /** Which parts of the product this tenant has turned on. Sent to every role. */
  features: Record<string, boolean>;
  roles: CompanyRole[];
  /** key → human label, for the roles editor's checkbox list. */
  permission_catalog: Record<string, string>;
  subscription: BootstrapSubscription | null;
  /** Admin-only; see OnboardingService, which supersedes this once loaded. */
  onboarding: OnboardingState | null;
  notifications: { unread_count: number } | null;
}

const CACHE_KEY = "gymly_bootstrap";

// One place the app reads "what is this tenant and what may this user do".
// Hydrated from GET /api/v1/bootstrap on login and hard reload — replaces
// separate /auth/me + /branding + /subscription calls. Navigation, route
// guards and the module-gated features all read from here.
@Injectable({ providedIn: "root" })
export class ConfigurationService {
  private readonly http = inject(HttpClient);
  private readonly branding = inject(BrandingService);
  // Resolved lazily (never at construction): LocaleService's constructor
  // kicks off a synchronous i18n fetch whose jwt interceptor pulls in
  // AuthService, which owns this service — eager injection would deadlock DI.
  private readonly injector = inject(Injector);

  private readonly state = signal<Bootstrap | null>(this.readCache());
  readonly ready = computed(() => this.state() !== null);

  // True once a live /bootstrap has landed this session. The cached state is
  // only a paint-early convenience — route guards must not gate on it (a
  // cache from an older deploy can lack `modules`/`permissions` and bounce
  // the user into a redirect loop), so ensureLoaded() waits for a live load.
  private hydrated = false;

  // One in-flight /bootstrap request shared by every caller (route guards,
  // the shell, app bootstrap) so a burst of navigations doesn't fan out.
  private inFlight: Observable<Bootstrap> | null = null;

  readonly company = computed(() => this.state()?.company ?? null);
  /** Tenant-wide feature switches. Says what is offered, never who may use it. */
  readonly features = computed(() => this.state()?.features ?? {});
  readonly role = computed(() => this.state()?.role ?? null);
  readonly permissions = computed(() => this.state()?.permissions ?? []);
  readonly modules = computed(() => this.state()?.modules ?? []);
  readonly roles = computed(() => this.state()?.roles ?? []);
  readonly permissionCatalog = computed(() => this.state()?.permission_catalog ?? {});
  readonly subscription = computed(() => this.state()?.subscription ?? null);
  /**
   * Whether this salle's members can use their app. True when nothing is
   * known yet, so a screen never greys out a button the backend would allow.
   */
  readonly memberApp = computed(() => this.state()?.subscription?.member_app ?? true);
  readonly onboarding = computed(() => this.state()?.onboarding ?? null);

  // The company's name for a built-in role (e.g. "coach" → "Praticien" for a
  // medical practice). Falls back to the raw key humanised.
  roleName(key: string): string {
    return this.roles().find((r) => r.key === key)?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
  }

  load(): Observable<Bootstrap> {
    const request = this.http.get<Bootstrap>(`${API_BASE_URL}/bootstrap`).pipe(
      tap({
        next: (res) => {
          this.state.set(res);
          this.hydrated = true;
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(res));
          } catch {
            /* private-mode / quota — the in-memory signal is still authoritative */
          }
          if (res.branding) {
            this.branding.apply(res.branding);
            // The tenant's language is superadmin-set and travels in the bootstrap
            // payload — apply it on every load (login + hard reload).
            this.injector.get(LocaleService).applyCompanyLocale(res.branding.locale);
          }
          // Admin notification feed: seed the badge, open the live socket.
          const notifications = this.injector.get(NotificationService);
          notifications.seedUnreadCount(res.notifications?.unread_count ?? 0);
          notifications.connect();
          this.inFlight = null;
        },
        error: () => {
          this.inFlight = null;
        },
      }),
      shareReplay(1)
    );
    this.inFlight = request;
    return request;
  }

  // Resolve once a configuration load has been *attempted* — hydrating it if
  // nothing has yet. Used by route guards, so it must never error: a failed
  // /bootstrap resolves `null` and the guard falls through (the backend
  // enforces the real gate anyway). Emits exactly once.
  ensureLoaded(): Observable<Bootstrap | null> {
    if (this.hydrated) return of(this.state());
    return (this.inFlight ?? this.load()).pipe(catchError(() => of(null)));
  }

  clear(): void {
    this.state.set(null);
    this.hydrated = false;
    this.inFlight = null;
    localStorage.removeItem(CACHE_KEY);
    this.injector.get(NotificationService).disconnect();
  }

  // A Gymly superadmin skips the tenant bootstrap entirely (see
  // AuthService.loadConfiguration) but still gets the real-time
  // system_update feed — same channel, same service, just no company state.
  // refresh() also seeds the unread badge immediately (no bootstrap payload
  // to seed it from, unlike the admin path).
  connectSuperadminNotifications(): void {
    const notifications = this.injector.get(NotificationService);
    notifications.connect();
    notifications.refresh();
  }

  hasPermission(key: string): boolean {
    // The server already expands "admin" to every permission there is, so a
    // plain membership check is enough here.
    return this.permissions().includes(key);
  }

  private readCache(): Bootstrap | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Bootstrap;
      // Reject a cache written by an older deploy that predates these fields.
      if (!Array.isArray(parsed.permissions) || !Array.isArray(parsed.modules)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
