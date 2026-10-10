import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, tap } from "rxjs";
import { activeCompany } from "../auth/active-company";
import { API_BASE_URL } from "../models/api-config";
import { CustomActivity } from "../models/activity-template.model";
import { Company } from "../models/company.model";
import { CompanySummary } from "../models/user.model";

/** One of the admin's salles, as the "Mes salles" page shows it. */
export interface NetworkCompany extends CompanySummary {
  city: string | null;
  members_count: number;
  /** The moderators (user ids) who work here. */
  moderator_ids: string[];
}

/** A staff login that can be posted to one or several salles — any but a coach. */
export interface NetworkModerator {
  id: string;
  full_name: string;
  email: string;
  role_name: string;
  role_key: string;
  active: boolean;
  company_ids: string[];
}

export interface CompanyNetwork {
  companies: NetworkCompany[];
  moderators: NetworkModerator[];
}

@Injectable({ providedIn: "root" })
export class CompanyService {
  constructor(private readonly http: HttpClient) {}

  // Always the admin's currently ACTIVE company (see #switch below) —
  // everything else in the API follows whichever one this is.
  get(): Observable<{ company: Company }> {
    return this.http.get<{ company: Company }>(`${API_BASE_URL}/company`);
  }

  // The admin's first salle, or another under the same login — as many as
  // they like on a paid Pro account, one on Starter and the trial; the backend refuses
  // the rest with 403 multi_salle_not_included. Becomes the active company.
  //
  // What it teaches can come in the same request — templates picked from
  // the catalogue and activities it names itself — so it opens ready to sell.
  create(
    payload: Partial<Company>,
    activities: { activity_template_ids?: string[]; custom_activities?: CustomActivity[] } = {}
  ): Observable<{ company: Company }> {
    return this.http.post<{ company: Company }>(`${API_BASE_URL}/companies`, { company: payload, ...activities });
  }

  // Every salle this login can switch between — the navbar switcher's data
  // source. An admin's salles, or the ones a moderator is posted to.
  list(): Observable<{ companies: CompanySummary[] }> {
    return this.http.get<{ companies: CompanySummary[] }>(`${API_BASE_URL}/companies`);
  }

  // Moves this tab onto another of this login's OWN salles, and saves it as
  // the salle a new tab or the next login opens on.
  switchTo(companyId: string): Observable<{ company: Company }> {
    return this.http
      .post<{ company: Company }>(`${API_BASE_URL}/companies/${companyId}/switch`, {})
      .pipe(tap(() => activeCompany.set(companyId)));
  }

  // The admin's "Mes salles" page: every salle, every moderator, and who
  // works where.
  network(): Observable<CompanyNetwork> {
    return this.http.get<CompanyNetwork>(`${API_BASE_URL}/companies/network`);
  }

  // Exactly who, among the admin's moderators, works at one salle. Answers
  // with the whole network, so the page redraws from one source.
  setModerators(companyId: string, userIds: string[]): Observable<CompanyNetwork> {
    return this.http.put<CompanyNetwork>(`${API_BASE_URL}/companies/${companyId}/moderators`, { user_ids: userIds });
  }

  update(payload: Partial<Company>): Observable<{ company: Company }> {
    return this.http.patch<{ company: Company }>(`${API_BASE_URL}/company`, {
      company: payload,
    });
  }

  // Separate from update() because it may carry a logo File and so needs
  // multipart/form-data — the plain company-profile form above never
  // uploads a file and stays on the simpler JSON path.
  //
  // Also carries what contracts are signed with: the signature image, the
  // signatory's name and the gym's own clauses. An empty string clears a
  // text field; `remove_signature` takes the image off.
  updateBranding(payload: {
    slug?: string | null;
    primary_color?: string | null;
    logo?: File | null;
    signature?: File | null;
    remove_signature?: boolean;
    signatory_name?: string | null;
    contract_terms?: string | null;
  }): Observable<{ company: Company }> {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      formData.append(`company[${key}]`, value instanceof File ? value : String(value));
    });
    return this.http.patch<{ company: Company }>(`${API_BASE_URL}/company`, formData);
  }

  /** Puts the gym in (or out of) the public directory. */
  publish(listed: boolean): Observable<{ company: Company }> {
    return this.http.post<{ company: Company }>(`${API_BASE_URL}/company/publish`, { listed });
  }
}
