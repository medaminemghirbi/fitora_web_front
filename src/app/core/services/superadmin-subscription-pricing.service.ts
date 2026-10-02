import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { PlanKey } from "../models/subscription.model";

export interface PlanPrice {
  plan: PlanKey;
  monthly_cents: number;
  annual_cents: number;
  /** How many accounts pay this price today. */
  accounts_count: number;
}

export interface SubscriptionPricing {
  currencies: string[];
  currency: string;
  annual_discount_percent: number;
  plans: PlanPrice[];
  companies_count: number;
}

// What each plan (Starter, Pro) costs per month in each currency, plus the
// global annual-billing discount. Superadmin-only.
@Injectable({ providedIn: "root" })
export class SuperadminSubscriptionPricingService {
  constructor(private readonly http: HttpClient) {}

  get(currency?: string): Observable<SubscriptionPricing> {
    const params: Record<string, string> = {};
    if (currency) params["currency"] = currency;
    return this.http.get<SubscriptionPricing>(`${API_BASE_URL}/superadmin/subscription_pricing`, { params });
  }

  // Either plan may be sent alone — an omitted one is left as-is.
  update(payload: { currency?: string; plans?: Partial<Record<PlanKey, number>>; annual_discount_percent?: number }): Observable<SubscriptionPricing> {
    return this.http.patch<SubscriptionPricing>(`${API_BASE_URL}/superadmin/subscription_pricing`, payload);
  }
}
