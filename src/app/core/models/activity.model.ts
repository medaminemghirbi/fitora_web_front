export type SessionFormat = "individual" | "small_group" | "collective";

/** Allowed capacity range per session format — mirrors Activity::CAPACITY_BOUNDS. */
export const CAPACITY_BOUNDS: Record<SessionFormat, { min: number; max: number | null }> = {
  individual: { min: 1, max: 1 },
  small_group: { min: 2, max: 9 },
  collective: { min: 10, max: null },
};

/** A plan's tariff for this activity — read-only here, edited on the plan. */
export interface ActivityTariff {
  contract_type_id: string;
  contract_type_name: string;
  billing_period: string;
  /** Days one purchase lasts, for a `custom` (carnet) period. */
  validity_days?: number | null;
  price: number;
}

export interface Activity {
  id: string;
  name: string;
  emoji: string | null;
  /** The catalogue entry it was copied from; null for one the gym named itself. */
  activity_template_id?: string | null;
  description: string | null;
  session_format: SessionFormat;
  duration: number;
  capacity: number;
  active: boolean;
  currency: string;
  prices: ActivityTariff[];
}
