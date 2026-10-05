/** A formule's tariff for this pack — read-only here, edited on the formule. */
export interface PackTariff {
  contract_type_id: string;
  contract_type_name: string;
  billing_period: string;
  /** Days one purchase lasts, for a `custom` (carnet) period. */
  validity_days?: number | null;
  price: number;
}

/**
 * Several activities sold as one — "Boxe + Musculation". A pack has no price
 * or duration of its own: like an activity, it is priced per formule, and the
 * formule decides how long a purchase lasts.
 */
export interface Pack {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  currency: string;
  activity_ids: string[];
  activities: { id: string; name: string; emoji: string | null }[];
  prices: PackTariff[];
}
