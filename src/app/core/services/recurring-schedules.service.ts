import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";

export interface WeeklyClassPayload {
  activity_id: string;
  coach_id: string | null;
  /** Every generated session goes in this room or cabin. */
  space_id?: string | null;
  /** "HH:MM" at the gym — the backend places it in the gym's time zone. */
  start_time: string;
  starts_on: string;
  ends_on: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
}

export interface WeeklyClassCreated {
  generated: number;
  skipped: number;
  conflicts: { starts_at: string; error: string }[];
}

export interface WeeklyClassStopped {
  cancelled_sessions: number;
  kept_sessions: number;
}

/**
 * A class that repeats every week. The backend generates its next 90 days of
 * sessions straight away and keeps topping them up nightly.
 */
@Injectable({ providedIn: "root" })
export class RecurringSchedulesService {
  private readonly http = inject(HttpClient);

  create(payload: WeeklyClassPayload): Observable<WeeklyClassCreated> {
    return this.http.post<WeeklyClassCreated>(`${API_BASE_URL}/recurring_schedules`, {
      recurring_schedule: { ...payload, recurrence_type: "weekly" },
    });
  }

  /**
   * Ends the series: no new sessions, and the upcoming ones nobody booked
   * are taken off. Booked ones stay for the gym to handle.
   */
  stop(id: string): Observable<WeeklyClassStopped> {
    return this.http.patch<WeeklyClassStopped>(`${API_BASE_URL}/recurring_schedules/${id}`, { active: false });
  }
}
