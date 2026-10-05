import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { Booking } from "../models/booking.model";
import { Client, ClientDetail } from "../models/client.model";
import { Contract } from "../models/contract.model";
import { Payment } from "../models/payment.model";
import { PageMeta } from "./sessions.service";

export type ClientStatusFilter = "active" | "inactive" | "contract_active" | "contract_expired" | "no_contract";

/** How the grid is ordered — a key the API whitelists, never a raw column. */
export type ClientSort = "name" | "joined";

export interface ClientFilters {
  search?: string;
  status?: ClientStatusFilter;
  /** The advanced panel: a plan, the activity it covers, gender, joined range. */
  contract_type_id?: string;
  activity_id?: string;
  gender?: string;
  joined_from?: string;
  joined_to?: string;
  sort?: ClientSort;
  direction?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

/** The plan half of a one-shot sign-up. Prices are the gym's, never sent. */
export interface EnrolmentSubscription {
  contract_type_id: string;
  /** One or the other: an activity, or a pack of several. */
  activity_id?: string;
  pack_id?: string;
  starts_on?: string;
  discount?: number;
  collect_payment?: boolean;
  payment_method?: string;
}

export interface EnrolmentResponse {
  client: Client;
  contract: Contract | null;
  payment: Payment | null;
}

export type ClientPayload = Partial<
  Pick<
    Client,
    "first_name" | "last_name" | "email" | "phone" | "active"
  > & {
    date_of_birth: string | null;
    gender: string | null;
    address: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    notes: string | null;
    health_notes: string | null;
    waiver_signed_on: string | null;
  }
>;

export interface ClientShowResponse {
  client: ClientDetail;
  contracts: Contract[];
  bookings: Booking[];
  payments: Payment[];
}

/** `counts` feeds the filter rail: one entry per status plus "all". */
export interface ClientListResponse {
  clients: Client[];
  meta: PageMeta;
  counts: Record<string, number>;
}

@Injectable({ providedIn: "root" })
export class ClientsService {
  constructor(private readonly http: HttpClient) {}

  list(filters: ClientFilters = {}): Observable<ClientListResponse> {
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params[key] = String(value);
    });
    return this.http.get<ClientListResponse>(`${API_BASE_URL}/clients`, { params });
  }

  /** The current list as CSV — same filters, no pagination (backend-side). */
  exportCsv(filters: ClientFilters = {}): Observable<Blob> {
    const params: Record<string, string> = { format: "csv" };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params[key] = String(value);
    });
    return this.http.get(`${API_BASE_URL}/clients`, { params, responseType: "blob" });
  }

  get(id: string): Observable<ClientShowResponse> {
    return this.http.get<ClientShowResponse>(`${API_BASE_URL}/clients/${id}`);
  }

  /**
   * Signs someone up. With a `subscription` the gym also sells them a plan,
   * and optionally takes the money, in the same request — the backend puts
   * all three in one transaction, so a member never survives a refused sale.
   */
  create(payload: ClientPayload, subscription?: EnrolmentSubscription): Observable<EnrolmentResponse> {
    const body: Record<string, unknown> = { client: payload };
    if (subscription) body["subscription"] = subscription;
    return this.http.post<EnrolmentResponse>(`${API_BASE_URL}/clients`, body);
  }

  /**
   * Switches the member's own app on by emailing them an invitation: they
   * choose their own password from the link. The gym never sets, sees or
   * resets it — a member who forgets it uses "forgot password".
   */
  invite(id: string): Observable<{ client: ClientDetail }> {
    return this.http.post<{ client: ClientDetail }>(`${API_BASE_URL}/clients/${id}/invite`, {});
  }

  /**
   * Takes the member off this gym: their upcoming bookings here are
   * cancelled and what the gym wrote about them goes. Refused while a
   * subscription is still running. Payments stay in the books.
   */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/clients/${id}`);
  }

  update(id: string, payload: ClientPayload): Observable<{ client: Client }> {
    return this.http.patch<{ client: Client }>(`${API_BASE_URL}/clients/${id}`, { client: payload });
  }
}
