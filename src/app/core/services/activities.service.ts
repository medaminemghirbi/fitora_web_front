import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { Activity } from "../models/activity.model";

export type ActivityPayload = Partial<
  Pick<Activity, "name" | "emoji" | "description" | "session_format" | "duration" | "capacity" | "active">
>;

@Injectable({ providedIn: "root" })
export class ActivitiesService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<{ activities: Activity[] }> {
    return this.http.get<{ activities: Activity[] }>(`${API_BASE_URL}/activities`);
  }

  get(id: string): Observable<{ activity: Activity }> {
    return this.http.get<{ activity: Activity }>(`${API_BASE_URL}/activities/${id}`);
  }

  create(payload: ActivityPayload): Observable<{ activity: Activity }> {
    return this.http.post<{ activity: Activity }>(`${API_BASE_URL}/activities`, { activity: payload });
  }

  /** Adds activities from the catalogue — each a copy the gym then owns. */
  adopt(templateIds: string[]): Observable<{ activities: Activity[] }> {
    return this.http.post<{ activities: Activity[] }>(`${API_BASE_URL}/activities/adopt`, { activity_template_ids: templateIds });
  }

  update(id: string, payload: ActivityPayload): Observable<{ activity: Activity }> {
    return this.http.patch<{ activity: Activity }>(`${API_BASE_URL}/activities/${id}`, { activity: payload });
  }

  deactivate(id: string): Observable<{ activity: Activity }> {
    return this.http.delete<{ activity: Activity }>(`${API_BASE_URL}/activities/${id}`);
  }
}
