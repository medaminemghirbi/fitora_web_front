import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { PageMeta } from "./sessions.service";

/**
 * A member as a coach sees them: who they are, how to reach them, when they
 * last came and when they are next due.
 *
 * Deliberately narrower than `Client`. A coach has no business with anyone's
 * subscription, balance or payment history, and the backend does not send it
 * (Api::V1::Coach::MembersController) — this type says so out loud, so
 * nothing in the coach UI can reach for a field that will never arrive.
 */
export interface CoachMember {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  /** Contraindications to know before the session (pacemaker, pregnancy, an injury). */
  health_notes?: string | null;
  last_seen_at: string | null;
  next_session_at: string | null;
}

export interface CoachMembersResponse {
  members: CoachMember[];
  meta: PageMeta;
}

@Injectable({ providedIn: "root" })
export class CoachMembersService {
  constructor(private readonly http: HttpClient) {}

  list(filters: { q?: string; page?: number } = {}): Observable<CoachMembersResponse> {
    const params: Record<string, string> = {};
    if (filters.q) params["q"] = filters.q;
    if (filters.page) params["page"] = String(filters.page);

    return this.http.get<CoachMembersResponse>(`${API_BASE_URL}/coach/members`, { params });
  }
}
