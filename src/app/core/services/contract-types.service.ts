import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { ContractType } from "../models/contract-type.model";

export type ContractTypePayload = Partial<
  Pick<
    ContractType,
    "name" | "description" | "billing_period" | "validity_days" | "session_count" | "unlimited_bookings" | "booking_limit" | "priority_booking" | "color" | "active"
  >
> & {
  /** The plan's pricing grid. The backend re-reads it as the source of truth —
   * a price sent from here is a proposal the API validates, never the total. */
  activity_prices?: { activity_id: string; price: number }[];
  /** The same for packs. Each list is synced only when sent: leave one out and its rows stay as they are. */
  pack_prices?: { pack_id: string; price: number }[];
};

@Injectable({ providedIn: "root" })
export class ContractTypesService {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<{ plans: ContractType[] }> {
    return this.http.get<{ plans: ContractType[] }>(`${API_BASE_URL}/contract_types`);
  }

  get(id: string): Observable<{ plan: ContractType }> {
    return this.http.get<{ plan: ContractType }>(`${API_BASE_URL}/contract_types/${id}`);
  }

  create(payload: ContractTypePayload): Observable<{ plan: ContractType }> {
    return this.http.post<{ plan: ContractType }>(`${API_BASE_URL}/contract_types`, this.body(payload));
  }

  update(id: string, payload: ContractTypePayload): Observable<{ plan: ContractType }> {
    return this.http.patch<{ plan: ContractType }>(`${API_BASE_URL}/contract_types/${id}`, this.body(payload));
  }

  // A list left undefined is left out of the body altogether, so the API
  // leaves those rows alone; an empty list clears them.
  private body(payload: ContractTypePayload): Record<string, unknown> {
    const { activity_prices, pack_prices, ...planFields } = payload;
    const body: Record<string, unknown> = { contract_type: planFields };
    if (activity_prices) body["activity_prices"] = activity_prices;
    if (pack_prices) body["pack_prices"] = pack_prices;
    return body;
  }
}
