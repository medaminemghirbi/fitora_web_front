import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { Invoice, PlanKey, Subscription } from "../models/subscription.model";

/** What one plan costs in the account's currency. */
export interface PlanPrice {
  key: PlanKey;
  monthly_cents: number;
  annual_cents: number;
}

/**
 * Fitora's own bank details — where the gym sends its subscription payment.
 *
 * Served from the environment, never stored: it is the same account for every
 * gym and it belongs in a dump about as much as a password does. null when no
 * RIB is configured, and the page shows the generic wording instead.
 */
export interface PayoutAccount {
  rib: string;
  bank_name: string | null;
  holder: string | null;
  swift: string | null;
  /** What the gym writes on the transfer so we can match it back to them. */
  reference: string | null;
}

export interface SubscriptionInfo {
  subscription: Subscription | null;
  /** Newest first — the history, and what the admin downloads. */
  invoices: Invoice[];
  /** Across every salle the account covers. */
  companies_count: number;
  clients_used: number;
  staff_used: number;
  currency: string | null;
  currency_symbol: string | null;
  monthly_subscription_cents: number;
  annual_subscription_cents: number;
  annual_discount_percent: number;
  /** Periods with no invoice behind them, times the tariff. */
  arrears_cents: number;
  /** How long the free trial signup gives away lasts. */
  trial_days: number;
  included_modules: string[];
  /** Both plans, in the account's currency. */
  plans: PlanPrice[];
  payout: PayoutAccount | null;
}

/**
 * The admin's view of their account's Fitora access. Read-only: there is nothing to
 * ask for. A gym settles with Fitora directly, Fitora confirms, and the
 * invoice appears here.
 */
@Injectable({ providedIn: "root" })
export class SubscriptionService {
  constructor(private readonly http: HttpClient) {}

  get(): Observable<SubscriptionInfo> {
    return this.http.get<SubscriptionInfo>(`${API_BASE_URL}/subscription`);
  }

  /** The invoice PDF, as a blob to hand straight to the browser. */
  downloadInvoice(id: string): Observable<Blob> {
    return this.http.get(`${API_BASE_URL}/invoices/${id}`, { responseType: "blob" });
  }
}
