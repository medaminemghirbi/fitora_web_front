export type PaymentRecordStatus = "paid" | "refunded" | "cancelled";
/**
 * What can be recorded. `card` exists in the backend enum so historical rows
 * still deserialise, but it is NOT selectable: Fitora takes no payment online
 * — money changes hands at the gym.
 */
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "other";
export type SelectablePaymentMethod = Exclude<PaymentMethod, "card">;

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentRecordStatus;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  client: { id: string; full_name: string; phone: string | null };
  company: { id: string; name: string };
  created_by: { id: string; full_name: string } | null;
  product_name: string | null;
}
