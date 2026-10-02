export type BillingPeriod = "monthly" | "yearly";

/**
 * The two plans Gymly sells, to the admin's account. Starter is the whole
 * product for one salle; Pro adds several salles (one price however many),
 * the member app, and every update Gymly ships.
 */
export type PlanKey = "starter" | "pro";
export const PLAN_KEYS: PlanKey[] = ["starter", "pro"];

/** Why access is closed, or null when it is open. Two reasons, never four. */
export type LockReason = "suspended" | "unpaid" | null;

/**
 * An admin account's access to Gymly — one for every salle it runs.
 *
 * `active` IS the access — nothing computes a date to read it. Everything
 * else here is what the invoices say, for the screens that show a countdown.
 */
export interface Subscription {
  id: string;
  active: boolean;
  billing_period: BillingPeriod | null;
  plan: PlanKey;
  /** Whether members can sign in to their app: Pro, or a free trial. */
  member_app: boolean;
  /** Whether the account may open another salle: Pro, or a free trial. */
  multi_salle: boolean;
  lock_reason: LockReason;
  /** The last day covered by an invoice. null = never paid. */
  paid_through: string | null;
  current_period_paid: boolean;
  /** Days left before the nightly sweep closes access. null = nothing ticking. */
  days_before_lock: number | null;
  /**
   * Nothing paid yet: the last period on record is the free one signup gave
   * away, running or run out. No plan is chosen while this is true.
   */
  trial: boolean;
  /** Free days left, today included. null outside a trial. */
  trial_days_left: number | null;
}

/** One period of access, paid for and recorded. The gym downloads it. */
export interface Invoice {
  id: string;
  number: string;
  period_start: string;
  period_end: string;
  /** Frozen at issue — never today's tariff. */
  amount: number;
  currency: string;
  billing_period: BillingPeriod;
  /** The plan this period was bought on, frozen at issue. */
  plan: PlanKey;
  /** The free period signup gave away. */
  trial: boolean;
  issued_at: string;
  issued_by: string | null;
  notes: string | null;
}
