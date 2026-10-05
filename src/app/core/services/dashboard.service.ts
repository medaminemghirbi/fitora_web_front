import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { Company } from "../models/company.model";

export interface TodaysScheduleItem {
  id: string;
  starts_at: string;
  ends_at: string;
  activity_name: string;
  activity_emoji: string | null;
  coach_name: string | null;
  company_name: string;
  confirmed_count: number;
  /** Marked present (or late) — what a session already over is read by. */
  attended_count?: number;
  capacity: number;
  status: string;
}

export interface ContractExpiringItem {
  id: string;
  client_name: string;
  plan_name: string;
  expires_at: string;
}

export interface RecentPaymentItem {
  id: string;
  client_name: string;
  amount: string;
  currency: string;
  paid_at: string;
}

export interface RecentClientItem {
  id: string;
  full_name: string;
  joined_at: string;
}

/**
 * A second line under an attention row, so the number is not the only thing
 * it says. `kind` names the sentence to translate; `count` fills its one
 * placeholder. null when there is nothing worth adding.
 */
export interface AttentionDetail {
  kind: "expiring_today" | "oldest_days";
  count: number;
}

/** One kind of overdue work. `key` names the screen it opens. */
export interface AttentionRow {
  key: "expiring" | "unpaid" | "expired" | "sessions_without_coach";
  count: number;
  /** null when there is no money in it, or when the login may not read it. */
  amount: number | null;
  detail: AttentionDetail | null;
}

/** One month of takings. Every month is present, zero or not: a gap in a
 *  line reads as missing data, not as a month where the gym took nothing. */
export interface RevenueMonth {
  month: string;
  total: string;
}

export interface DashboardStats {
  total_clients: number;
  active_contracts: number;
  todays_bookings: number;
  todays_attendance: number;
  /** null when the login may not read what the gym earns (see the `revenue` capability). */
  outstanding_payments: string | null;
  todays_schedule: TodaysScheduleItem[];
  attention: AttentionRow[];
  contracts_expiring: ContractExpiringItem[];
  recent_payments: RecentPaymentItem[];
  recent_clients: RecentClientItem[];
  /** Empty for a login that may not read what the gym earns. */
  revenue_by_month: RevenueMonth[];
}

export interface DashboardResponse {
  company: Company;
  stats: DashboardStats;
}

@Injectable({ providedIn: "root" })
export class DashboardService {
  constructor(private readonly http: HttpClient) {}

  get(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${API_BASE_URL}/admin/dashboard`);
  }
}
