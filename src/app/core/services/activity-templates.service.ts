import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { ActivityTemplate } from "../models/activity-template.model";

/** The platform's activity catalogue — readable before the gym exists, at signup. */
@Injectable({ providedIn: "root" })
export class ActivityTemplatesService {
  private readonly http = inject(HttpClient);

  list(): Observable<{ activity_templates: ActivityTemplate[] }> {
    return this.http.get<{ activity_templates: ActivityTemplate[] }>(`${API_BASE_URL}/activity_templates`);
  }
}
