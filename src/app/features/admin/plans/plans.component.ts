import { Component, OnInit, computed, effect, signal, Input, inject, output, untracked } from "@angular/core";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { ContractType, ContractBillingPeriod } from "../../../core/models/contract-type.model";
import { ContractTypesService, ContractTypePayload } from "../../../core/services/contract-types.service";
import { CatalogueKind, CatalogueStore } from "../catalogue/catalogue.store";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { PaginationComponent } from "../../../shared/components/pagination.component";
import { HighlightPipe } from "../../../shared/pipes/highlight.pipe";
import { clientPageMeta, filterBySearch, pageSlice } from "../../../shared/utils/client-list";
import { PageHeaderComponent } from "../../../shared/ui/page-header.component";

@Component({
  selector: "app-plans",
  standalone: true,
  imports: [PageHeaderComponent, FormsModule, ReactiveFormsModule, TranslateModule, EmptyStateComponent, ModalComponent, MoneyPipe, SkeletonComponent, StatusBadgeComponent, PaginationComponent, HighlightPipe],
  templateUrl: "./plans.component.html",
  styleUrl: "./plans.component.scss",
})
export class PlansComponent implements OnInit {
  /**
   * Rendered inside the catalogue page rather than on a route of its own.
   * A price only exists where a plan crosses an activity, so the two belong
   * on one screen; the shell supplies the heading when they are there.
   */
  @Input() embedded = false;

  /** Something to create that another tab owns — the activity a formule needs first. */
  readonly requestCreate = output<CatalogueKind>();

  readonly store = inject(CatalogueStore);
  readonly loading = this.store.loading;
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly billingPeriods: ContractBillingPeriod[] = ["monthly", "quarterly", "semi_annual", "yearly", "custom"];

  readonly plans = this.store.plans;
  /** Every active activity of the gym — the rows of the plan's pricing grid. */
  readonly activities = this.store.activeActivities;
  /** And the packs, priced on the same grid. */
  readonly packs = this.store.activePacks;
  /** activity_id → price typed in the modal; absent means "not sold for it". */
  readonly activityPrices = signal<Record<string, number | null>>({});
  /** pack_id → price, the same way. */
  readonly packPrices = signal<Record<string, number | null>>({});
  readonly planModalOpen = signal(false);
  readonly editingPlan = signal<ContractType | null>(null);

  readonly search = signal("");
  readonly page = signal(1);
  readonly filtered = computed(() => filterBySearch(this.plans(), this.search(), (p) => [p.name, p.description]));
  readonly pagedPlans = computed(() => pageSlice(this.filtered(), this.page()));
  readonly meta = computed(() => clientPageMeta(this.filtered().length, this.page()));
  readonly planForm = this.fb.nonNullable.group({
    name: ["", Validators.required],
    description: [""],
    billing_period: ["monthly" as ContractBillingPeriod, Validators.required],
    validity_days: [null as number | null],
    session_count: [null as number | null],
    unlimited_bookings: [true],
    booking_limit: [null as number | null],
    priority_booking: [false],
    color: ["#4a2a8f", Validators.required],
    active: [true],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly contractTypesService: ContractTypesService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute,
    private readonly translate: TranslateService
  ) {
    effect(() => {
      this.search();
      this.page.set(1);
    }, { allowSignalWrites: true });

    // "Create a formule" asked for from the setup steps or the price grid —
    // honoured once the activities it needs are in.
    effect(() => {
      if (this.loading()) return;
      if (this.store.takeCreateRequest("plan")) untracked(() => this.openCreatePlan());
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.store.loadOnce();

    if (this.route.snapshot.queryParamMap.get("action") === "new") this.store.requestCreate("plan");
  }

  /** Nothing to price yet: a formule is always sold for an activity or a pack. */
  readonly nothingToPrice = computed(() => this.activities().length === 0 && this.packs().length === 0);

  openCreatePlan(): void {
    this.editingPlan.set(null);
    this.planForm.reset({ billing_period: "monthly", unlimited_bookings: true, priority_booking: false, color: "#4a2a8f", active: true });
    this.activityPrices.set({});
    this.packPrices.set({});
    this.formError.set(null);
    this.planModalOpen.set(true);
  }

  openEditPlan(plan: ContractType): void {
    this.editingPlan.set(plan);
    this.planForm.setValue({
      name: plan.name,
      description: plan.description || "",
      billing_period: plan.billing_period,
      validity_days: plan.validity_days ?? null,
      session_count: plan.session_count,
      unlimited_bookings: plan.unlimited_bookings,
      booking_limit: plan.booking_limit,
      priority_booking: plan.priority_booking,
      color: plan.color,
      active: plan.active,
    });
    this.activityPrices.set(Object.fromEntries(plan.activity_prices.map((row) => [row.activity_id, Number(row.price)])));
    this.packPrices.set(Object.fromEntries((plan.pack_prices ?? []).map((row) => [row.pack_id, Number(row.price)])));
    this.formError.set(null);
    this.planModalOpen.set(true);
  }

  priceFor(activityId: string): number | null {
    return this.activityPrices()[activityId] ?? null;
  }

  setPrice(activityId: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const next = { ...this.activityPrices() };
    // An empty field is not "free" — it means the plan isn't offered for that
    // activity, so the row is dropped rather than priced at 0.
    if (raw === "") delete next[activityId];
    else next[activityId] = Number(raw);
    this.activityPrices.set(next);
  }

  readonly nameOf = (a: { name: string }): string => a.name;

  packPriceFor(packId: string): number | null {
    return this.packPrices()[packId] ?? null;
  }

  setPackPrice(packId: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const next = { ...this.packPrices() };
    if (raw === "") delete next[packId];
    else next[packId] = Number(raw);
    this.packPrices.set(next);
  }

  /**
   * The two are one decision: a plan either has no limit, or it has a number
   * of sessions. Holding both produced plans named "24 Séances" that sold as
   * unlimited, because the checkbox defaulted to on and nothing cleared the
   * count beside it.
   */
  setUnlimited(unlimited: boolean): void {
    this.planForm.patchValue({
      unlimited_bookings: unlimited,
      session_count: unlimited ? null : this.planForm.controls.session_count.value,
      booking_limit: unlimited ? null : this.planForm.controls.booking_limit.value,
    });
  }

  private pricedRows(): { activity_id: string; price: number }[] {
    return priced(this.activityPrices()).map(([activity_id, price]) => ({ activity_id, price }));
  }

  private pricedPacks(): { pack_id: string; price: number }[] {
    return priced(this.packPrices()).map(([pack_id, price]) => ({ pack_id, price }));
  }

  closePlanModal(): void {
    this.planModalOpen.set(false);
  }

  submitPlan(): void {
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched();
      return;
    }

    // A carnet with its own lifetime needs that lifetime; a fixed period
    // carries one, so a number left in the field from before is dropped.
    const custom = this.planForm.controls.billing_period.value === "custom";
    const validity = this.planForm.controls.validity_days.value;
    if (custom && !(validity && validity > 0)) {
      this.formError.set(this.translate.instant("contract_types.needs_validity"));
      return;
    }

    if (!this.planForm.controls.unlimited_bookings.value && !this.planForm.controls.session_count.value) {
      this.formError.set(this.translate.instant("contract_types.needs_session_count"));
      return;
    }

    const activity_prices = this.pricedRows();
    const pack_prices = this.pricedPacks();
    if (activity_prices.length === 0 && pack_prices.length === 0) {
      this.formError.set(this.translate.instant("contract_types.needs_a_price"));
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    // The prices go up as a proposal: the API decides what a subscription
    // actually costs, this form never sends a total.
    const payload: ContractTypePayload = {
      ...this.planForm.getRawValue(),
      validity_days: custom ? validity : null,
      activity_prices,
      pack_prices,
    };
    const editing = this.editingPlan();
    const request = editing ? this.contractTypesService.update(editing.id, payload) : this.contractTypesService.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.planModalOpen.set(false);
        this.toast.success(this.translate.instant("common.save"));
        this.store.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}

/** The rows of a price form that were filled in: an empty field isn't "free", it's "not sold". */
function priced(prices: Record<string, number | null>): [string, number][] {
  return Object.entries(prices)
    .filter((entry): entry is [string, number] => entry[1] !== null && !Number.isNaN(entry[1]) && Number(entry[1]) >= 0)
    .map(([id, price]) => [id, Number(price)]);
}
