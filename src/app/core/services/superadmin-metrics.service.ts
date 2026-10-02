import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { PlanKey } from "../models/subscription.model";

export interface PlatformMetrics {
  companies: {
    total: number;
    /** Gyms whose door is open. `open + locked` always equals `total`. */
    open: number;
    locked: number;
    new_this_month: number;
    new_last_month: number;
    /** Admin ACCOUNTS on each plan — one account may run several gyms. */
    plans: Record<PlanKey, number>;
  };
  members: {
    total: number;
    new_this_month: number;
  };
  /** Whether gyms are running on this, as opposed to having signed up. */
  activity: {
    sessions_last_30_days: number;
    bookings_last_30_days: number;
    companies_with_activity: number;
  };
  /** Gymly's own money, in cents, never a gym's takings. */
  money: {
    invoiced_this_month_cents: number;
    arrears_cents: number;
    currency: string;
  };
  recent_companies: {
    id: string;
    name: string;
    city: string | null;
    admin_name: string;
    created_at: string;
    access_open: boolean;
  }[];
}

@Injectable({ providedIn: "root" })
export class SuperadminMetricsService {
  constructor(private readonly http: HttpClient) {}

  get(): Observable<PlatformMetrics> {
    return this.http.get<PlatformMetrics>(`${API_BASE_URL}/superadmin/metrics`);
  }
}
