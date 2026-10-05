export type SessionStatus = "scheduled" | "cancelled" | "completed";
export type SessionAvailability = "available" | "full" | "cancelled";

export interface Session {
  id: string;
  activity_id: string;
  activity_name: string;
  activity_emoji: string | null;
  // Which gym this session is at — a member's list spans several.
  company_id: string;
  company_name: string;
  coach_id: string | null;
  coach_name: string | null;
  /** The room or cabin, for a gym that runs them. */
  space_id?: string | null;
  space_name?: string | null;
  /** A one-to-one slot (EMS, personal training) — an appointment, not a class. */
  individual?: boolean;
  /** Set when a weekly class generated this session. */
  recurring_schedule_id?: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  confirmed_count: number;
  price: number;
  status: SessionStatus;
  availability: SessionAvailability;
  already_booked: boolean;
}
