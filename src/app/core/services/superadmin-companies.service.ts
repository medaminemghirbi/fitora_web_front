import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { SuperadminCompany, SuperadminCurrencyOption } from "../models/superadmin-company.model";
import { Invoice, PlanKey } from "../models/subscription.model";
import { API_BASE_URL } from "../models/api-config";
import { User } from "../models/user.model";
import { PageMeta } from "./sessions.service";

export interface UpdateSubscriptionPayload {
  /** The access itself — for every salle of the account. */
  active?: boolean;
  billing_period?: string | null;
  /** Starter or Pro — the account's, whichever salle it is set from. */
  plan?: PlanKey;
}

@Injectable({ providedIn: "root" })
export class SuperadminCompaniesService {
  constructor(private readonly http: HttpClient) {}

  /**
   * `closed` narrows to the gyms whose access is shut. The count comes back
   * either way, so the list says how many without a screen of its own —
   * nobody should have to open a gym's page to find out.
   */
  list(page = 1, q?: string, closed = false): Observable<{ companies: SuperadminCompany[]; meta: PageMeta; closed_count: number }> {
    const params: Record<string, string> = { page: String(page) };
    if (q) params["q"] = q;
    if (closed) params["closed"] = "1";
    return this.http.get<{ companies: SuperadminCompany[]; meta: PageMeta; closed_count: number }>(
      `${API_BASE_URL}/superadmin/companies`,
      { params }
    );
  }

  get(id: string): Observable<{
    company: SuperadminCompany;
    currency_options: SuperadminCurrencyOption[];
    locale_options: string[];
  }> {
    return this.http.get<{
      company: SuperadminCompany;
      currency_options: SuperadminCurrencyOption[];
      locale_options: string[];
    }>(`${API_BASE_URL}/superadmin/companies/${id}`);
  }

  invoices(id: string): Observable<{ invoices: Invoice[] }> {
    return this.http.get<{ invoices: Invoice[] }>(`${API_BASE_URL}/superadmin/companies/${id}/invoices`);
  }

  /**
   * The money for one period arrived: issues an invoice for the next period
   * the gym has not paid for, and reopens access. Payment happens off-app,
   * so this is the only record that it happened at all.
   */
  issueInvoice(id: string, notes?: string): Observable<{ invoice: Invoice; company: SuperadminCompany }> {
    return this.http.post<{ invoice: Invoice; company: SuperadminCompany }>(
      `${API_BASE_URL}/superadmin/companies/${id}/invoices`,
      notes ? { notes } : {}
    );
  }

  /** Voids one issued in error. */
  voidInvoice(id: string, invoiceId: string): Observable<{ company: SuperadminCompany }> {
    return this.http.delete<{ company: SuperadminCompany }>(`${API_BASE_URL}/superadmin/companies/${id}/invoices/${invoiceId}`);
  }

  updateSubscription(id: string, payload: UpdateSubscriptionPayload): Observable<{ company: SuperadminCompany }> {
    return this.http.patch<{ company: SuperadminCompany }>(`${API_BASE_URL}/superadmin/companies/${id}/subscription`, payload);
  }

  // Tenant-wide display settings — currency + app language — that a Fitora
  // superadmin manages on the company's behalf.
  updateSettings(id: string, settings: { currency?: string; locale?: string }): Observable<{ company: SuperadminCompany }> {
    return this.http.patch<{ company: SuperadminCompany }>(`${API_BASE_URL}/superadmin/companies/${id}/settings`, { company: settings });
  }

  impersonate(id: string): Observable<{ token: string; user: User }> {
    return this.http.post<{ token: string; user: User }>(`${API_BASE_URL}/superadmin/companies/${id}/impersonate`, {});
  }
}
