import { PlanKey, Subscription } from "./subscription.model";

export interface SuperadminCurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

/** What the gym is actually doing with Gymly — what an activation rests on. */
export interface SuperadminCompanyUsage {
  clients: number;
  staff: number;
  activities: number;
  sessions_last_30_days: number;
  last_session_at: string | null;
}

export interface SuperadminCompany {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  currency: string;
  currency_symbol: string;
  locale: string;
  active: boolean;
  created_at: string;
  admin: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    companies_count: number;
  };
  /**
   * The ACCOUNT's plan, not this one salle's: every salle the admin runs
   * shares it, its access and its invoices. null = no subscription yet.
   */
  plan: PlanKey | null;
  subscription: Subscription | null;
  /** Every salle the account covers, this one flagged `current`. */
  account_companies: { id: string; name: string; city: string | null; current: boolean }[];
  /** Owed: periods with no invoice behind them, times the tariff. */
  arrears_cents: number;
  /**
   * What recording a payment would issue, now: the period and the amount.
   * During a trial it starts the day after the free days end.
   */
  next_invoice: { period_start: string; period_end: string; amount_cents: number } | null;
  usage: SuperadminCompanyUsage;
  access_open: boolean;
  // The subscription price in the company's currency, read-only here.
  monthly_subscription_cents: number;
  annual_subscription_cents: number;
  annual_discount_percent: number;
  // Every feature is included for every company.
  included_modules: string[];
}
