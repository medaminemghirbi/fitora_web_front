import { PaymentStatus } from "./contract.model";

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

/** How a seat is paid for: the member's contract, a free trial, or a single session (drop-in). */
export type BookingKind = "contract" | "trial" | "drop_in";

export interface Booking {
  id: string;
  status: BookingStatus;
  amount: number;
  currency: string;
  payment_status: PaymentStatus;
  /** A free first session, booked by the desk with no contract. */
  trial?: boolean;
  created_at: string;
  /** What paid for the seat. `null` only on payloads older than trials and drop-ins. */
  covered_by: { type: "contract"; name: string } | { type: "trial" | "drop_in"; name?: undefined } | null;
  client: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  };
  session: {
    id: string;
    starts_at: string;
    ends_at: string;
    status: SessionStatusLike;
    activity_name: string;
    activity_emoji: string | null;
    company_id: string;
    company_name: string;
    coach_name: string | null;
  };
}

type SessionStatusLike = "scheduled" | "cancelled" | "completed";
