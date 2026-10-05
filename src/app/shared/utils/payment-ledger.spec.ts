import { Invoice } from "../../core/models/subscription.model";
import { ledgerFor, ledgerYears } from "./payment-ledger";

function invoice(period_start: string, period_end: string, id = "inv"): Invoice {
  return {
    id,
    number: "FIT-2026-0001",
    period_start,
    period_end,
    amount: 99,
    currency: "TND",
    billing_period: "monthly",
    issued_at: `${period_start}T00:00:00Z`,
    issued_by: "Fitora",
    notes: null,
  } as Invoice;
}

describe("ledgerYears", () => {
  const today = new Date("2026-09-18T00:00:00Z");

  it("offers the current year even for a gym with no history", () => {
    expect(ledgerYears([], today)).toEqual([2026]);
  });

  // A fixed [n-1, n, n+1] window left a long-standing gym's oldest invoices
  // reachable by nothing at all.
  it("reaches back as far as the invoices go", () => {
    const invoices = [invoice("2023-01-01", "2023-01-31"), invoice("2026-09-01", "2026-09-30")];
    expect(ledgerYears(invoices, today)).toEqual([2023, 2026]);
  });

  it("opens both years a yearly invoice straddles", () => {
    expect(ledgerYears([invoice("2026-07-01", "2027-06-30")], today)).toEqual([2026, 2027]);
  });

  it("never lists a year twice", () => {
    const invoices = [invoice("2026-01-01", "2026-01-31", "a"), invoice("2026-02-01", "2026-02-28", "b")];
    expect(ledgerYears(invoices, today)).toEqual([2026]);
  });

  it("sorts oldest first, whatever order the invoices arrive in", () => {
    const invoices = [invoice("2027-01-01", "2027-01-31", "a"), invoice("2024-01-01", "2024-01-31", "b")];
    expect(ledgerYears(invoices, today)).toEqual([2024, 2026, 2027]);
  });
});

describe("ledgerFor", () => {
  const today = new Date("2026-09-18T00:00:00Z");

  it("gives twelve months, always", () => {
    expect(ledgerFor(2026, [], today).length).toBe(12);
    expect(ledgerFor(2026, [], today).map((c) => c.label)).toContain("Nov");
  });

  it("paints a month paid when an invoice covers its first day", () => {
    const cells = ledgerFor(2026, [invoice("2026-01-01", "2026-01-31")], today);
    expect(cells[0].state).toBe("paid");
    expect(cells[0].invoice).not.toBeNull();
  });

  it("paints all twelve from one yearly invoice", () => {
    const cells = ledgerFor(2026, [invoice("2026-01-01", "2026-12-31")], today);
    expect(cells.every((c) => c.state === "paid")).toBe(true);
  });

  it("leaves a skipped month a hole rather than filling it in", () => {
    const cells = ledgerFor(2026, [invoice("2026-01-01", "2026-01-31")], today);
    expect(cells[1].state).toBe("missed");
    expect(cells[1].invoice).toBeNull();
  });

  it("marks the month we are in as current, not missed", () => {
    expect(ledgerFor(2026, [], today)[8].state).toBe("current");
  });

  it("marks the months after it as future", () => {
    expect(ledgerFor(2026, [], today)[9].state).toBe("future");
  });

  it("treats a whole past year as missed, never as future", () => {
    expect(ledgerFor(2025, [], today).every((c) => c.state === "missed")).toBe(true);
  });

  it("treats a whole future year as future", () => {
    expect(ledgerFor(2027, [], today).every((c) => c.state === "future")).toBe(true);
  });

  // A gym that signed up on 23 September owed nothing in January.
  it("leaves the months before the gym existed blank, never missed", () => {
    const cells = ledgerFor(2026, [], today, new Date("2026-09-23T10:00:00Z"));
    expect(cells.slice(0, 8).every((c) => c.state === "before")).toBe(true);
    expect(cells[8].state).toBe("current");
  });

  it("reads the signup month from the signup day, so the first days show covered", () => {
    const trial = { ...invoice("2026-09-23", "2026-10-06"), trial: true };
    const cells = ledgerFor(2026, [trial], today, new Date("2026-09-23T10:00:00Z"));
    expect(cells[8].invoice).toBe(trial);
  });

  // The free days are covered, but nothing was paid for them.
  it("tells the trial apart from a paid month", () => {
    const trial = { ...invoice("2026-09-23", "2026-10-06", "t"), trial: true };
    const paid = invoice("2026-10-07", "2027-10-06", "y");
    const cells = ledgerFor(2026, [trial, paid], today, new Date("2026-09-23T00:00:00Z"));
    expect(cells.slice(8).map((c) => c.state)).toEqual(["trial", "trial", "paid", "paid"]);
  });
});
