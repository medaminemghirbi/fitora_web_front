import { Routes } from "@angular/router";
import { authGuard } from "./core/guards/auth.guard";
import { guestGuard } from "./core/guards/guest.guard";
import { noCompanyGuard, companyGuard } from "./core/guards/company.guard";
import { roleGuard } from "./core/guards/role.guard";
import { capabilityGuard, deskAreaGuard, featureGuard, adminAreaGuard, settingsAccessGuard, staffRoleGuard } from "./core/guards/staff.guard";
import { memberGuard } from "./core/guards/member.guard";
import { emailConfirmedGuard, emailPendingGuard } from "./core/guards/email.guard";

/**
 * Fitora is sold to gyms. Everything before signing in is written for one:
 * the landing page, signing up, and a single sign-in.
 *
 * /member is the app a gym gives its own members — the gym's schedule, their
 * bookings, their file. It is reached only by a member whose gym enabled
 * their account: there is no directory to browse, no gym to search for and
 * no way to sign yourself up. /auth/login serves both kinds of account and
 * says which came back, which is why there is still only one door.
 */
export const routes: Routes = [
  {
    path: "",
    canActivate: [guestGuard],
    children: [
      { path: "", pathMatch: "full", loadComponent: () => import("./features/landing/landing.component").then((m) => m.LandingComponent) },
      { path: "connexion", loadComponent: () => import("./features/b2b/auth/pro-login.component").then((m) => m.ProLoginComponent) },
      { path: "inscription", loadComponent: () => import("./features/b2b/auth/register.component").then((m) => m.RegisterComponent) },
      { path: "mot-de-passe-oublie", loadComponent: () => import("./features/auth/forgot-password.component").then((m) => m.ForgotPasswordComponent) },
    ],
  },

  // Reached from a link in an email, so not guest-only: someone already
  // signed in on this device should still land here and see it succeed.
  {
    path: "verify-email",
    loadComponent: () => import("./features/auth/verify-email.component").then((m) => m.VerifyEmailComponent),
  },
  {
    // Between signing up and clicking the emailed link: waits for the click
    // (from this tab, another one, or a phone) and moves on by itself.
    path: "confirmation-email",
    canActivate: [authGuard, emailPendingGuard],
    loadComponent: () => import("./features/auth/confirm-email.component").then((m) => m.ConfirmEmailComponent),
  },
  {
    path: "auth/reset-password",
    loadComponent: () => import("./features/auth/reset-password.component").then((m) => m.ResetPasswordComponent),
  },
  {
    // A member choosing their password from their gym's invitation — the
    // same form as a reset, with its own words (see ResetPasswordComponent).
    path: "auth/accept-invitation",
    data: { mode: "invitation" },
    loadComponent: () => import("./features/auth/reset-password.component").then((m) => m.ResetPasswordComponent),
  },

  {
    // The only page a locked gym sees. Outside /admin on purpose: it has no
    // shell and no navigation, because the point is that the door is shut.
    path: "account-locked",
    canActivate: [authGuard],
    loadComponent: () => import("./features/account-locked/account-locked.component").then((m) => m.AccountLockedComponent),
  },
  { path: "trial-expired", pathMatch: "full", redirectTo: "/account-locked" },
  {
    path: "admin/setup-company",
    canActivate: [authGuard, roleGuard("admin"), emailConfirmedGuard, noCompanyGuard],
    loadComponent: () =>
      import("./features/admin/onboarding/company-setup.component").then((m) => m.CompanySetupComponent),
  },
  {
    path: "admin",
    canActivate: [authGuard, emailConfirmedGuard, adminAreaGuard, companyGuard],
    loadComponent: () => import("./layout/admin-shell/admin-shell.component").then((m) => m.AdminShellComponent),
    children: [
      { path: "dashboard", canActivate: [capabilityGuard("reports")], loadComponent: () => import("./features/admin/dashboard/dashboard.component").then((m) => m.DashboardComponent) },
      { path: "onboarding", canActivate: [roleGuard("admin")], loadComponent: () => import("./features/admin/onboarding/onboarding.component").then((m) => m.OnboardingComponent) },
      { path: "getting-started", pathMatch: "full", redirectTo: "onboarding" },
      { path: "clients", canActivate: [capabilityGuard("clients")], loadComponent: () => import("./features/admin/clients/clients-list.component").then((m) => m.ClientsListComponent) },
      { path: "clients/:id", canActivate: [capabilityGuard("clients")], loadComponent: () => import("./features/admin/clients/client-profile.component").then((m) => m.ClientProfileComponent) },
      { path: "calendar", loadComponent: () => import("./features/admin/calendar/calendar.component").then((m) => m.CalendarComponent) },
      // Rooms exist only for a gym that turned them on; both guards apply,
      // because "the product offers this" and "you may use it" are separate
      // questions and the backend asks both too.
      { path: "spaces", canActivate: [featureGuard("spaces"), capabilityGuard("spaces")], loadComponent: () => import("./features/admin/spaces/spaces.component").then((m) => m.SpacesComponent) },
      { path: "bookings", canActivate: [capabilityGuard("bookings")], loadComponent: () => import("./features/admin/bookings/bookings.component").then((m) => m.AdminBookingsComponent) },
      { path: "contracts", canActivate: [capabilityGuard("contracts")], loadComponent: () => import("./features/admin/contracts/contracts.component").then((m) => m.ContractsComponent) },
      // The catalogue left Settings: a plan and an activity are seasonal
      // business objects, not one-off configuration.
      // Plans and activities are one page: a price only exists where the two
      // cross. The old routes still resolve, so a bookmark or an old link
      // lands somewhere sensible rather than on a 404.
      { path: "catalogue", canActivate: [capabilityGuard("contract_types")], loadComponent: () => import("./features/admin/catalogue/catalogue.component").then((m) => m.CatalogueComponent) },
      { path: "contracts/plans", pathMatch: "full", redirectTo: "catalogue" },
      { path: "contracts/activities", pathMatch: "full", redirectTo: "catalogue" },
      { path: "payments", canActivate: [capabilityGuard("payments")], loadComponent: () => import("./features/admin/payments/payments.component").then((m) => m.AdminPaymentsComponent) },
      // Import/export moved under Settings; the old link keeps working.
      { path: "data-exchange", redirectTo: "settings/data-exchange", pathMatch: "full" },
      { path: "team", canActivate: [capabilityGuard("coaches")], loadComponent: () => import("./features/admin/team/team.component").then((m) => m.TeamComponent) },
      // Coaches + Staff were merged into one Team page — keep the old paths working.
      { path: "coaches", pathMatch: "full", redirectTo: "team" },
      { path: "staff", pathMatch: "full", redirectTo: "team" },
      { path: "subscription", canActivate: [roleGuard("admin")], loadComponent: () => import("./features/admin/subscription/subscription.component").then((m) => m.SubscriptionComponent) },
      // Every salle the admin runs: open one, switch to one, post moderators.
      { path: "salles", canActivate: [roleGuard("admin")], loadComponent: () => import("./features/admin/salles/salles.component").then((m) => m.SallesComponent) },
      { path: "support", canActivate: [roleGuard("admin")], loadComponent: () => import("./features/admin/support/support.component").then((m) => m.AdminSupportComponent) },
      { path: "notifications", canActivate: [roleGuard("admin")], loadComponent: () => import("./features/admin/notifications/notifications-inbox.component").then((m) => m.NotificationsInboxComponent) },
      { path: "notifications/:id", canActivate: [roleGuard("admin")], loadComponent: () => import("./features/admin/notifications/notification-detail.component").then((m) => m.NotificationDetailComponent) },
      { path: "settings", canActivate: [settingsAccessGuard], loadComponent: () => import("./features/admin/settings/settings-shell.component").then((m) => m.SettingsShellComponent) },
      { path: "settings/:section", canActivate: [settingsAccessGuard], loadComponent: () => import("./features/admin/settings/settings-shell.component").then((m) => m.SettingsShellComponent) },
      // The marketplace is gone — every feature is included in the subscription.
      { path: "modules", pathMatch: "full", redirectTo: "subscription" },
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
    ],
  },
  // The front desk. Its own shell rather than a filtered admin shell: the
  // desk's job is a different shape from running the gym, and hiding menu
  // items from a layout built for someone else is not the same as building
  // the one this job needs.
  {
    path: "desk",
    canActivate: [authGuard, deskAreaGuard, companyGuard],
    loadComponent: () => import("./layout/desk-shell/desk-shell.component").then((m) => m.DeskShellComponent),
    children: [
      { path: "dashboard", loadComponent: () => import("./features/desk/dashboard/desk-dashboard.component").then((m) => m.DeskDashboardComponent) },
      { path: "checkin", loadComponent: () => import("./features/desk/checkin/desk-checkin.component").then((m) => m.DeskCheckinComponent) },
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
    ],
  },
  {
    path: "coach",
    canActivate: [authGuard, staffRoleGuard("coach")],
    loadComponent: () => import("./layout/coach-shell/coach-shell.component").then((m) => m.CoachShellComponent),
    children: [
      { path: "today", loadComponent: () => import("./features/coach/today/today.component").then((m) => m.CoachTodayComponent) },
      { path: "members", loadComponent: () => import("./features/coach/members/coach-members.component").then((m) => m.CoachMembersComponent) },
      { path: "", pathMatch: "full", redirectTo: "today" },
    ],
  },
  {
    path: "superadmin",
    canActivate: [authGuard, roleGuard("superadmin")],
    loadComponent: () => import("./layout/superadmin-shell/superadmin-shell.component").then((m) => m.SuperadminShellComponent),
    children: [
      { path: "overview", loadComponent: () => import("./features/superadmin/overview/superadmin-overview.component").then((m) => m.SuperadminOverviewComponent) },
      { path: "companies", loadComponent: () => import("./features/superadmin/companies/companies.component").then((m) => m.SuperadminCompaniesComponent) },
      { path: "companies/:id", loadComponent: () => import("./features/superadmin/company-detail/company-detail.component").then((m) => m.SuperadminCompanyDetailComponent) },
      { path: "pricing", loadComponent: () => import("./features/superadmin/pricing/pricing.component").then((m) => m.SuperadminPricingComponent) },
      { path: "modules", pathMatch: "full", redirectTo: "pricing" },
      { path: "support", loadComponent: () => import("./features/superadmin/support/support-tickets.component").then((m) => m.SuperadminSupportTicketsComponent) },
      { path: "updates", loadComponent: () => import("./features/superadmin/updates/updates.component").then((m) => m.SuperadminUpdatesComponent) },
      { path: "", pathMatch: "full", redirectTo: "overview" },
    ],
  },

  {
    path: "member",
    canActivate: [authGuard, memberGuard],
    loadComponent: () => import("./layout/member-shell/member-shell.component").then((m) => m.MemberShellComponent),
    children: [
      { path: "home", loadComponent: () => import("./features/member/schedule/member-schedule.component").then((m) => m.MemberScheduleComponent) },
      { path: "bookings", loadComponent: () => import("./features/member/bookings/member-bookings.component").then((m) => m.MemberBookingsComponent) },
      { path: "profile", loadComponent: () => import("./features/member/profile/member-profile.component").then((m) => m.MemberProfileComponent) },
      { path: "", pathMatch: "full", redirectTo: "home" },
    ],
  },

  // ---- where the earlier layouts put these -------------------------------
  { path: "pro", pathMatch: "full", redirectTo: "" },
  { path: "pro/connexion", pathMatch: "full", redirectTo: "/connexion" },
  { path: "pro/mot-de-passe-oublie", pathMatch: "full", redirectTo: "/mot-de-passe-oublie" },
  { path: "auth/login", pathMatch: "full", redirectTo: "/connexion" },
  { path: "auth/register", pathMatch: "full", redirectTo: "/inscription" },
  { path: "auth/forgot-password", pathMatch: "full", redirectTo: "/mot-de-passe-oublie" },
  // A gym is joined, never found: the directory the member sign-up fed is
  // not coming back. /inscription is the gym's own sign-up now.
  { path: "gyms", redirectTo: "" },

  { path: "**", redirectTo: "" },
];
