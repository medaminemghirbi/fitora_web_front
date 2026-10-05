import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { Pack } from "../models/pack.model";

export type PackPayload = Partial<Pick<Pack, "name" | "description" | "active">> & {
  /** Two or more; omitted, the pack keeps the activities it has. */
  activity_ids?: string[];
};

@Injectable({ providedIn: "root" })
export class PacksService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<{ packs: Pack[] }> {
    return this.http.get<{ packs: Pack[] }>(`${API_BASE_URL}/packs`);
  }

  create(payload: PackPayload): Observable<{ pack: Pack }> {
    const { activity_ids, ...fields } = payload;
    return this.http.post<{ pack: Pack }>(`${API_BASE_URL}/packs`, { pack: fields, activity_ids });
  }

  update(id: string, payload: PackPayload): Observable<{ pack: Pack }> {
    const { activity_ids, ...fields } = payload;
    return this.http.patch<{ pack: Pack }>(`${API_BASE_URL}/packs/${id}`, { pack: fields, activity_ids });
  }

  /** Soft: contracts sold with the pack keep it. */
  deactivate(id: string): Observable<{ pack: Pack }> {
    return this.http.delete<{ pack: Pack }>(`${API_BASE_URL}/packs/${id}`);
  }
}
