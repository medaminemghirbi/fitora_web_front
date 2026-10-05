/**
 * What a member's own app is allowed to see.
 *
 * Separate from Session/Contract on purpose: those are the gym's view and
 * carry prices, attendance counts and payment status. These mirror
 * PublicSessionSerializer and Api::V1::Me::ProfilesController exactly, so
 * anything added to the gym's side later cannot silently appear here.
 */
export interface MemberSession {
  id: string;
  company_id: string;
  activity_name: string;
  activity_emoji: string | null;
  coach_name: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  /** Room left, never how many people are in it. */
  spots_left: number;
  /** A one-to-one slot (EMS, personal training): an appointment to take, not a class to join. */
  individual?: boolean;
  /** The room or cabin it runs in, for a gym that has them. */
  space_name?: string | null;
  full: boolean;
  already_booked: boolean;
}

export interface MemberSubscription {
  plan_name: string;
  activity_name: string;
  activity_emoji: string | null;
  starts_at: string | null;
  expires_at: string | null;
  /** null means the plan is unlimited, not that none are left. */
  remaining_bookings: number | null;
}

export interface MemberAttendanceEntry {
  id: string;
  activity_name: string;
  activity_emoji: string | null;
  starts_at: string;
}

export interface MemberProfile {
  client: {
    id: string;
    full_name: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
  gyms: { id: string; name: string }[];
  subscription: MemberSubscription | null;
  attendance: { rate: number | null; recent: MemberAttendanceEntry[] };
}
