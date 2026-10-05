/**
 * How long one purchase lasts. `custom` is a carnet with a lifetime of its
 * own — "10 séances valables 8 semaines" — counted in `validity_days`.
 */
export type ContractBillingPeriod = "monthly" | "quarterly" | "semi_annual" | "yearly" | "custom";

/** What one activity costs under one plan — the gym's pricing grid. */
export interface ActivityPrice {
  activity_id: string;
  activity_name: string;
  activity_emoji: string | null;
  price: number;
}

/** What one pack costs under one plan — the same grid, for packs. */
export interface PackPrice {
  pack_id: string;
  pack_name: string;
  activity_names: string[];
  price: number;
}

export interface ContractType {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  currency: string;
  billing_period: ContractBillingPeriod;
  duration_days: number;
  /** Set only for a `custom` period: how many days one purchase lasts. */
  validity_days: number | null;
  session_count: number | null;
  unlimited_bookings: boolean;
  booking_limit: number | null;
  priority_booking: boolean;
  color: string;
  active: boolean;
  activity_ids: string[];
  /** One row per activity this plan is sold for; an activity with no row isn't offered. */
  activity_prices: ActivityPrice[];
  /** One row per pack this plan is sold for; a pack with no row isn't offered. */
  pack_prices: PackPrice[];
}

/** One thing a plan can be sold for: an activity, or a pack of several. */
export interface SellableItem {
  kind: "activity" | "pack";
  id: string;
  /** "activity:<id>" / "pack:<id>" — one value a single <select> can hold. */
  key: string;
  label: string;
  price: number;
}

/**
 * What a plan can be sold for, read off its own pricing grid — activities
 * first, then packs. Anything without a row isn't offered, so it isn't listed.
 */
export function sellableItems(plan: ContractType | null | undefined): SellableItem[] {
  if (!plan) return [];
  const activities = plan.activity_prices.map((row): SellableItem => ({
    kind: "activity",
    id: row.activity_id,
    key: `activity:${row.activity_id}`,
    label: row.activity_emoji ? `${row.activity_emoji} ${row.activity_name}` : row.activity_name,
    price: Number(row.price),
  }));
  const packs = (plan.pack_prices ?? []).map((row): SellableItem => ({
    kind: "pack",
    id: row.pack_id,
    key: `pack:${row.pack_id}`,
    label: `${row.pack_name} (${row.activity_names.join(" + ")})`,
    price: Number(row.price),
  }));
  return [...activities, ...packs];
}

/** The sale payload's half for a SellableItem key: `activity_id` or `pack_id`. */
export function sellableTarget(key: string | null | undefined): { activity_id?: string; pack_id?: string } {
  if (!key) return {};
  const [kind, id] = key.split(":");
  return kind === "pack" ? { pack_id: id } : { activity_id: id };
}
