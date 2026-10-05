import { Component, OnInit, computed, effect, inject, output, signal, untracked } from "@angular/core";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { forkJoin, Observable, of, switchMap } from "rxjs";
import { Pack } from "../../../core/models/pack.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { PacksService } from "../../../core/services/packs.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { PaginationComponent } from "../../../shared/components/pagination.component";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";
import { HighlightPipe } from "../../../shared/pipes/highlight.pipe";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ActionMenuComponent } from "../../../shared/ui/action-menu.component";
import { clientPageMeta, filterBySearch, pageSlice } from "../../../shared/utils/client-list";
import { CatalogueKind, CatalogueStore } from "../catalogue/catalogue.store";

/**
 * Packs: several activities sold as one abonnement — "Boxe + Musculation" —
 * for a gym that teaches more than one discipline.
 *
 * A pack has no price of its own. Like an activity it is priced per formule,
 * so the form asks for the activities it opens and, beside each formule, what
 * it costs there; those prices are written onto the formules.
 */
@Component({
  selector: "app-packs",
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    EmptyStateComponent,
    ModalComponent,
    StatusBadgeComponent,
    PaginationComponent,
    MoneyPipe,
    HighlightPipe,
    SkeletonComponent,
    ErrorStateComponent,
    ActionMenuComponent,
  ],
  templateUrl: "./packs.component.html",
  styleUrl: "./packs.component.scss",
})
export class PacksComponent implements OnInit {
  readonly store = inject(CatalogueStore);
  private readonly fb = inject(FormBuilder);
  private readonly packsService = inject(PacksService);
  private readonly contractTypes = inject(ContractTypesService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);

  /** Something to create that another tab owns — the activities a pack needs. */
  readonly requestCreate = output<CatalogueKind>();

  readonly packs = this.store.packs;
  readonly activities = this.store.activeActivities;
  readonly plans = this.store.activePlans;
  readonly loading = this.store.loading;
  readonly error = this.store.error;

  /** Two activities are the least a pack can hold. */
  readonly canCreate = computed(() => this.activities().length >= 2);

  readonly search = signal("");
  readonly page = signal(1);
  readonly filtered = computed(() =>
    filterBySearch(this.packs(), this.search(), (p) => [p.name, p.description, ...p.activities.map((a) => a.name)])
  );
  readonly paged = computed(() => pageSlice(this.filtered(), this.page()));
  readonly meta = computed(() => clientPageMeta(this.filtered().length, this.page()));

  readonly modalOpen = signal(false);
  readonly editing = signal<Pack | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  /** plan id → price typed in the form; absent means "not sold under that formule". */
  readonly prices = signal<Record<string, number>>({});

  readonly form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    description: [""],
    active: [true],
  });

  constructor() {
    effect(() => {
      this.search();
      this.page.set(1);
    }, { allowSignalWrites: true });

    // "Create a pack" asked for from the setup steps or the price grid.
    effect(() => {
      if (this.loading()) return;
      if (this.store.takeCreateRequest("pack")) untracked(() => this.openCreate());
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.store.loadOnce();
  }

  pricesOf(pack: Pack): { plan: ContractType; price: number }[] {
    return this.store.pricesForPack(pack.id);
  }

  openCreate(): void {
    if (!this.canCreate()) return;
    this.editing.set(null);
    this.form.reset({ name: "", description: "", active: true });
    this.selected.set(new Set());
    this.prices.set({});
    this.formError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(pack: Pack): void {
    this.editing.set(pack);
    this.form.reset({ name: pack.name, description: pack.description ?? "", active: pack.active });
    this.selected.set(new Set(pack.activity_ids));
    this.prices.set(Object.fromEntries(this.pricesOf(pack).map(({ plan, price }) => [plan.id, price])));
    this.formError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  toggle(activityId: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  }

  priceFor(planId: string): number | null {
    return this.prices()[planId] ?? null;
  }

  setPrice(planId: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const next = { ...this.prices() };
    // Empty is "not sold under this formule", never "free".
    if (raw === "") delete next[planId];
    else next[planId] = Number(raw);
    this.prices.set(next);
  }

  /** What the ticked activities would cost one by one under a formule — the figure a pack is measured against. */
  separately(plan: ContractType): number | null {
    const rows = plan.activity_prices.filter((r) => this.selected().has(r.activity_id));
    if (rows.length < 2) return null;
    return rows.reduce((sum, r) => sum + Number(r.price), 0);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.selected().size < 2) {
      this.formError.set(this.translate.instant("packs.needs_two"));
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    const editing = this.editing();
    const payload = { ...this.form.getRawValue(), activity_ids: [...this.selected()] };
    const save$ = editing ? this.packsService.update(editing.id, payload) : this.packsService.create(payload);

    save$.pipe(switchMap(({ pack }) => this.writePrices(pack.id))).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(this.translate.instant("common.save"));
        this.store.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        // The pack itself may have been saved before a price failed.
        this.store.reload();
      },
    });
  }

  /**
   * The prices live on the formules, so each formule whose price for this
   * pack changed gets its pack list re-sent — and only those.
   */
  private writePrices(packId: string): Observable<unknown> {
    const typed = this.prices();
    const updates = this.plans().flatMap((plan) => {
      const rows = (plan.pack_prices ?? []).filter((r) => r.pack_id !== packId);
      const before = (plan.pack_prices ?? []).find((r) => r.pack_id === packId);
      const after = typed[plan.id];
      const beforePrice = before ? Number(before.price) : undefined;
      if (after === beforePrice || (after !== undefined && Number.isNaN(after))) return [];

      const pack_prices = rows.map((r) => ({ pack_id: r.pack_id, price: Number(r.price) }));
      if (after !== undefined) pack_prices.push({ pack_id: packId, price: after });
      return [this.contractTypes.update(plan.id, { pack_prices })];
    });
    return updates.length ? forkJoin(updates) : of(null);
  }

  async deactivate(pack: Pack): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("common.deactivate") + " " + pack.name + "?",
      body: this.translate.instant("packs.deactivate_body"),
      confirmLabel: this.translate.instant("common.deactivate"),
      danger: true,
    });
    if (!confirmed) return;

    this.packsService.deactivate(pack.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.deactivate"));
        this.store.reload();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

  reactivate(pack: Pack): void {
    this.packsService.update(pack.id, { active: true }).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.save"));
        this.store.reload();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }
}
