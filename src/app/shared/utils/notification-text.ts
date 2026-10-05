import { TranslateService } from "@ngx-translate/core";
import { AppNotification, NotificationKind } from "../../core/models/notification.model";

function formatDate(t: TranslateService, iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(t.currentLang || "fr", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(t: TranslateService, iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(t.currentLang || "fr", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
}

type Composer = (t: TranslateService, data: AppNotification["data"]) => { title: string; body: string };

/**
 * One composer per kind, as a total map rather than a switch.
 *
 * A switch without a default returned `undefined` for a kind nobody had
 * taught it about, and the page read `.title` off it — a blank screen and a
 * console full of TypeErrors, for a notification the backend was perfectly
 * happy to send. A Record over the union makes the next missing kind a
 * compile error instead.
 */
const COMPOSERS: Record<NotificationKind, Composer> = {
  contract_expiring: (t, d) => ({
    title: t.instant("notifications.contract_expiring.title"),
    body: t.instant("notifications.contract_expiring.body", {
      name: d["client_name"] ?? "—",
      type: d["contract_type"] ?? "—",
      date: formatDate(t, d["expires_at"]),
    }),
  }),
  employee_birthday: (t, d) => ({
    title: t.instant("notifications.employee_birthday.title"),
    body: t.instant("notifications.employee_birthday.body", { name: d["name"] ?? "—" }),
  }),
  system_update: (t, d) => ({
    title: t.instant("notifications.system_update.title", { version: d["version"] ?? "" }),
    body: d["title"] ?? "",
  }),
  invoice_issued: (t, d) => ({
    title: t.instant("notifications.invoice_issued.title", { number: d["number"] ?? "—" }),
    body: t.instant("notifications.invoice_issued.body", {
      amount: d["amount"] ?? "—",
      currency: d["currency"] ?? "",
    }),
  }),
  session_cancelled: (t, d) => ({
    title: t.instant("notifications.session_cancelled.title"),
    body: t.instant("notifications.session_cancelled.body", {
      activity: d["activity_name"] ?? "—",
      date: formatDateTime(t, d["starts_at"]),
      gym: d["gym_name"] ?? "",
    }),
  }),
  waitlist_promoted: (t, d) => ({
    title: t.instant("notifications.waitlist_promoted.title"),
    body: t.instant("notifications.waitlist_promoted.body", {
      activity: d["activity_name"] ?? "—",
      date: formatDateTime(t, d["starts_at"]),
      gym: d["gym_name"] ?? "",
    }),
  }),
  session_reminder: (t, d) => ({
    title: t.instant("notifications.session_reminder.title"),
    body: t.instant("notifications.session_reminder.body", {
      activity: d["activity_name"] ?? "—",
      date: formatDateTime(t, d["starts_at"]),
      gym: d["gym_name"] ?? "",
    }),
  }),
  subscription_expiring: (t, d) => ({
    title: t.instant("notifications.subscription_expiring.title"),
    body: t.instant("notifications.subscription_expiring.body", {
      plan: d["plan_name"] ?? "—",
      date: formatDate(t, d["expires_at"]),
      gym: d["gym_name"] ?? "",
    }),
  }),
};

const CTA_KEYS: Record<NotificationKind, string> = {
  contract_expiring: "notifications.open_contract",
  employee_birthday: "notifications.open_employee",
  system_update: "notifications.open_system_update",
  invoice_issued: "notifications.open_invoice",
  session_cancelled: "notifications.open_bookings",
  waitlist_promoted: "notifications.open_bookings",
  subscription_expiring: "notifications.open_profile",
  session_reminder: "notifications.open_bookings",
};

/** The localized title + body for a notification, composed from `kind` + `data`. */
export function notificationText(t: TranslateService, n: AppNotification): { title: string; body: string } {
  // A kind this build does not know about still has to render something: an
  // older tab can outlive a deploy that added one.
  const composer = COMPOSERS[n.kind];
  if (!composer) return { title: t.instant("notifications.title"), body: "" };

  return composer(t, n.data);
}

/** i18n key for the "open the related resource" button on the detail page. */
export function notificationCtaKey(n: AppNotification): string {
  return CTA_KEYS[n.kind] ?? "notifications.open_generic";
}
