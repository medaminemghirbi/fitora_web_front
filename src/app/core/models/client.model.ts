import { Contract } from "./contract.model";

export interface Client {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  /** Whether the gym has switched on this member's own app. */
  login_enabled: boolean;
  joined_at: string;
  /**
   * When they last actually turned up at this gym, or null if never. Sent on
   * the list as one grouped query for the whole page — the column that says
   * who is drifting away.
   */
  last_visit_at: string | null;
  current_contract: Contract | null;
}

export interface ClientDetail extends Client {
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  /** Contraindications a coach must know (pacemaker, pregnancy, an injury). Shown to the member's coaches. */
  health_notes: string | null;
  /** When the member signed the studio's health declaration (YYYY-MM-DD). */
  waiver_signed_on: string | null;
  outstanding_balance: string;
  attendance_rate: number | null;
  /**
   * Name, email and phone belong to the person once they sign in or train at
   * another gym too; the API refuses to change them then (it can still fill
   * a blank). The personal details above are this gym's own copy.
   */
  identity_locked: boolean;
  /** An invitation to the app was sent and has not been accepted yet. */
  invitation_pending: boolean;
  invited_at: string | null;
}
