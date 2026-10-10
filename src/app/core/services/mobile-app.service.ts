import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";

/** The salle's two mobile-app keys, and their QR codes (SVG, drawn by the backend). */
export interface MobileAppKeys {
  member_code: string;
  coach_key: string;
  member_qr_svg: string;
  coach_qr_svg: string;
}

export type AppKeyAudience = "member" | "coach";

/** Settings → Application mobile (a Pro tool). */
@Injectable({ providedIn: "root" })
export class MobileAppService {
  private readonly http = inject(HttpClient);

  keys(): Observable<MobileAppKeys> {
    return this.http.get<MobileAppKeys>(`${API_BASE_URL}/mobile_app`);
  }

  regenerate(audience: AppKeyAudience): Observable<MobileAppKeys> {
    return this.http.post<MobileAppKeys>(`${API_BASE_URL}/mobile_app/regenerate`, { audience });
  }
}
