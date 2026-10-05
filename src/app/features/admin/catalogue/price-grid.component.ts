import { Component, computed, inject, output, signal } from "@angular/core";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { ContractType } from "../../../core/models/contract-type.model";
import { ContractTypesService, ContractTypePayload } from "../../../core/services/contract-types.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { CatalogueKind, CatalogueStore } from "./catalogue.store";

type RowKind = "activity" | "pack";

/**
 * Every price the gym charges, on one screen: a row per activity and per
 * pack, a column per formule, and the price where they cross.
 *
 * That crossing is the only place a price exists, and it used to be readable
 * only from one side at a time — a formule's card listed its activities, an
 * activity's row listed its formules. Here it is the grid itself, and each
 * cell is edited where it stands: typing a number sells that row under that
 * formule, clearing it stops selling it.
 */
@Component({
  selector: "app-price-grid",
  standalone: true,
  imports: [TranslateModule],
  templateUrl: "./price-grid.component.html",
  styleUrl: "./price-grid.component.scss",
})
export class PriceGridComponent {
  readonly store = inject(CatalogueStore);
  private readonly contractTypes = inject(ContractTypesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  /** Something to create that another tab owns — a formule, a pack. */
  readonly requestCreate = output<CatalogueKind>();

  readonly plans = this.store.activePlans;
  readonly activities = this.store.activeActivities;
  readonly packs = this.store.activePacks;
  readonly currency = computed(() => this.plans()[0]?.currency ?? this.activities()[0]?.currency ?? "");
  readonly hiddenPlans = computed(() => this.store.plans().length - this.plans().length);

  /** Cells with a save in flight, and those that just landed (for a brief tick). */
  readonly saving = signal<ReadonlySet<string>>(new Set());
  readonly saved = signal<ReadonlySet<string>>(new Set());

  key(plan: ContractType, kind: RowKind, id: string): string {
    return `${plan.id}:${kind}:${id}`;
  }

  isSaving(plan: ContractType, kind: RowKind, id: string): boolean {
    return this.saving().has(this.key(plan, kind, id));
  }

  isSaved(plan: ContractType, kind: RowKind, id: string): boolean {
    return this.saved().has(this.key(plan, kind, id));
  }

  priceOf(plan: ContractType, kind: RowKind, id: string): number | null {
    const row =
      kind === "activity"
        ? plan.activity_prices.find((r) => r.activity_id === id)
        : (plan.pack_prices ?? []).find((r) => r.pack_id === id);
    return row ? Number(row.price) : null;
  }

  /** How many formules sell this row — a row sold by none is flagged. */
  soldIn(kind: RowKind, id: string): number {
    return this.plans().filter((plan) => this.priceOf(plan, kind, id) !== null).length;
  }

  onKey(event: KeyboardEvent, plan: ContractType, kind: RowKind, id: string): void {
    const input = event.target as HTMLInputElement;
    if (event.key === "Enter") {
      input.blur();
    } else if (event.key === "Escape") {
      input.value = this.display(this.priceOf(plan, kind, id));
      input.blur();
    }
  }

  display(price: number | null): string {
    return price === null ? "" : String(price);
  }

  commit(event: Event, plan: ContractType, kind: RowKind, id: string): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim();
    const current = this.priceOf(plan, kind, id);
    const next = raw === "" ? null : Number(raw.replace(",", "."));

    if (next !== null && (Number.isNaN(next) || next < 0)) {
      input.value = this.display(current);
      return;
    }
    if (next === current) return;

    const cell = this.key(plan, kind, id);
    this.mark(this.saving, cell, true);

    this.contractTypes.update(plan.id, this.payload(plan, kind, id, next)).subscribe({
      next: ({ plan: updated }) => {
        this.mark(this.saving, cell, false);
        this.store.replacePlan(updated);
        this.mark(this.saved, cell, true);
        setTimeout(() => this.mark(this.saved, cell, false), 1400);
      },
      error: (err) => {
        this.mark(this.saving, cell, false);
        input.value = this.display(current);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  /**
   * The formule's whole list for that kind, with this one cell changed. Only
   * that list is sent: the API leaves the other one as it is.
   */
  private payload(plan: ContractType, kind: RowKind, id: string, price: number | null): ContractTypePayload {
    if (kind === "activity") {
      const rows = plan.activity_prices
        .filter((r) => r.activity_id !== id)
        .map((r) => ({ activity_id: r.activity_id, price: Number(r.price) }));
      if (price !== null) rows.push({ activity_id: id, price });
      return { activity_prices: rows };
    }
    const rows = (plan.pack_prices ?? [])
      .filter((r) => r.pack_id !== id)
      .map((r) => ({ pack_id: r.pack_id, price: Number(r.price) }));
    if (price !== null) rows.push({ pack_id: id, price });
    return { pack_prices: rows };
  }

  private mark(set: typeof this.saving, cell: string, on: boolean): void {
    set.update((current) => {
      const next = new Set(current);
      if (on) next.add(cell);
      else next.delete(cell);
      return next;
    });
  }
}
