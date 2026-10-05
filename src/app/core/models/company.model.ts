/**
 * How a gym has configured the engine to behave.
 *
 * The values are the gym's; the keys are code (see CompanySettings on the
 * backend, which drops anything it does not declare). A boxing club and an
 * EMS studio differ by what is in here, not by a type column.
 */
export interface CompanySettings {
  features: {
    bookings: boolean;
    /** Rooms. Off unless the gym has more than one place to be. */
    spaces: boolean;
    attendance: boolean;
    revenue: boolean;
    reports: boolean;
    /** Whether members book themselves, or the desk books for them. */
    online_booking: boolean;
    /** Whether a full session takes a queue. */
    waitlist: boolean;
    /** Whether the desk may book a trial or a single paid session with no contract. */
    drop_in: boolean;
    /** Packs (several activities sold as one) — off unless a multi-discipline gym asks. */
    packs: boolean;
  };
  booking: {
    /** Hours before the start a member may still cancel. 0 = up to the start. */
    cancellation_hours: number;
    /** How far ahead the schedule is bookable. */
    booking_opens_days: number;
    no_show_consumes_session: boolean;
    /** Hours before a session the member is reminded of it. 0 = off. */
    reminder_hours: number;
    /** Whether that reminder also goes out by SMS (paid per message). */
    reminder_sms: boolean;
  };
  hours: { start: string; end: string; working_days: number[] };
  branding: { primary_color: string | null };
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  currency: string;
  // Short symbol for `currency` (e.g. "DT", "€") and the tenant-wide app
  // language — both Fitora-superadmin managed, shown read-only to the admin.
  currency_symbol: string;
  locale: string;
  // Days the company operates, as JS getDay() / Ruby wday integers
  // (0 = Sunday … 6 = Saturday). Edited in Settings > Planning.
  working_days: number[];
  active: boolean;
  slug: string | null;
  primary_color: string | null;
  settings: CompanySettings;
  logo_url: string | null;
  /** The signature printed on every contract PDF (Settings → Image de marque). */
  signature_url?: string | null;
  /** Who signs the gym's contracts, e.g. "Sami Trabelsi, gérant". */
  signatory_name?: string | null;
  /** The gym's own contract clauses, one per line; empty prints Fitora's defaults. */
  contract_terms?: string | null;
  // Opening hours — on the company since the site was merged into it.
  business_hours_start: string;
  business_hours_end: string;
  // Set once the admin publishes the gym in the public directory.
  listed_at: string | null;
  // Every feature is included — the key list the subscription page renders
  // as "what's included".
  included_modules: string[];
  // The subscription price in the company's own currency, in cents.
  monthly_subscription_cents: number;
  annual_subscription_cents: number;
  annual_discount_percent: number;
  // What the company currently owes Fitora, in cents — set by hand by an
  // superadmin, shown read-only on the admin's subscription page.
}
