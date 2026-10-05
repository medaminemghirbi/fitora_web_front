import { ContractType } from "./contract-type.model";

export type ContractStatus = "pending" | "active" | "expired" | "cancelled";
export type PaymentStatus = "unpaid" | "paid";

/** The term sold to follow a contract — a contract of its own. */
export interface ContractRenewalSummary {
  id: string;
  starts_at: string | null;
  expires_at: string | null;
  final_price: string;
  payment_status: PaymentStatus;
  plan_name: string;
}

/** One term of a membership: it starts, it ends, it is paid or not. Renewing
 *  sells a new contract linked back to this one (`renewed_from_id`). */
export interface Contract {
  id: string;
  /** FAC-2026-0001 — printed on the invoice and the signed contract. */
  invoice_ref: string;
  status: ContractStatus;
  /** On hold (injury, holidays): nothing books against it, and the time held is given back on resume. */
  paused: boolean;
  paused_at: string | null;
  starts_at: string | null;
  expires_at: string | null;
  remaining_bookings: number | null;
  auto_renew: boolean;
  discount: string;
  // The price this contract was SOLD at, frozen at subscription time.
  base_price: string | null;
  final_price: string;
  payment_status: PaymentStatus;
  /** What's still owed on this contract — no part payments: owed in full or not at all. */
  amount_due: string;
  plan: ContractType;
  /**
   * null for an all-access contract, which covers every activity its plan
   * covers rather than naming one. Read `all_access` to tell that apart from
   * missing data, and `activity_label` for something to show a person.
   */
  activity: { id: string; name: string; emoji: string | null } | null;
  /** Set instead of `activity` when the abonnement sells a pack. */
  pack?: { id: string; name: string; activity_names: string[] } | null;
  /** The contract this one renews, or null for a first sale. */
  renewed_from_id: string | null;
  /**
   * The term sold to follow this one, or null. Renewing before this term
   * runs out never overwrites it: the renewal queues behind it, and both are kept.
   */
  renewal: ContractRenewalSummary | null;
  /**
   * Whether "Renouveler" applies: the latest term of its chain, ending within
   * 10 days (or ended, or out of sessions). The backend refuses otherwise.
   */
  renewable: boolean;
  all_access: boolean;
  /** The activity's name, or the names of everything the plan covers. Never empty. */
  activity_label: string;
  client: { id: string; full_name: string; phone: string | null };
}
