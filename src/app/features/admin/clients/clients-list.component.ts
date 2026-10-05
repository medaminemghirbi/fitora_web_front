import { Component, OnInit, computed, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { DatePipe } from "@angular/common";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Client } from "../../../core/models/client.model";
import { ClientFilters, ClientSort, ClientsService, ClientStatusFilter, EnrolmentSubscription } from "../../../core/services/clients.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ContractType, sellableItems, sellableTarget } from "../../../core/models/contract-type.model";
import { Activity } from "../../../core/models/activity.model";
import { BrandingService } from "../../../core/services/branding.service";
import { PageMeta } from "../../../core/services/sessions.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { downloadBlob } from "../../../core/services/download.util";
import { AvatarComponent } from "../../../shared/components/avatar.component";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { PaginationComponent } from "../../../shared/components/pagination.component";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { HighlightPipe } from "../../../shared/pipes/highlight.pipe";
import { SEARCH_DEBOUNCE_MS } from "../../../shared/utils/client-list";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { StatusFilterComponent, StatusFilterOption } from "../../../shared/ui/status-filter.component";
import { WizardStepsComponent } from "../../../shared/ui/wizard-steps.component";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";

@Component({
  selector: "app-clients-list",
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
    AvatarComponent,
    EmptyStateComponent,
    ModalComponent,
    PaginationComponent,
    SpinnerComponent,
    StatusBadgeComponent,
    HighlightPipe,
    SkeletonComponent,
    ErrorStateComponent,
    StatusFilterComponent,
    WizardStepsComponent,
    MoneyPipe,
  ],
  templateUrl: "./clients-list.component.html",
})
export class ClientsListComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);
  readonly clients = signal<Client[]>([]);
  readonly meta = signal<PageMeta | null>(null);
  readonly search = signal("");
  readonly statusFilter = signal<ClientStatusFilter | "">("");
  readonly page = signal(1);

  // ---- the advanced filters ----------------------------------------------
  // Everything the status pills cannot say: which plan, which activity it
  // covers, and when they joined. Folded away by default, because most
  // visits to this page are "find this one person" — and opened, the drawer
  // keeps its own state so a sort or a page turn does not shut it.
  readonly advancedOpen = signal(false);
  readonly planFilter = signal("");
  readonly activityFilter = signal("");
  readonly genderFilter = signal("");
  readonly joinedFrom = signal("");
  readonly joinedTo = signal("");

  /** How the grid is ordered. Only the columns the API whitelists are sortable. */
  readonly sort = signal<ClientSort>("name");
  readonly direction = signal<"asc" | "desc">("asc");

  /** value "" is "all"; the colour is the strip the matching rows carry. */
  readonly statusOptions: { value: ClientStatusFilter | ""; labelKey: string; countKey: string; color: string }[] = [
    { value: "", labelKey: "clients.filter_all", countKey: "all", color: "var(--color-primary)" },
    { value: "active", labelKey: "common.active", countKey: "active", color: "var(--color-success)" },
    { value: "inactive", labelKey: "common.inactive", countKey: "inactive", color: "var(--color-muted)" },
    { value: "contract_active", labelKey: "clients.filter_contract_active", countKey: "contract_active", color: "var(--color-info)" },
    { value: "contract_expired", labelKey: "clients.filter_contract_expired", countKey: "contract_expired", color: "var(--color-danger)" },
    { value: "no_contract", labelKey: "clients.filter_no_contract", countKey: "no_contract", color: "var(--color-warning)" },
  ];

  /** Per-status totals from the API, keyed as the options' countKey. */
  readonly counts = signal<Record<string, number>>({});

  readonly railOptions = computed<StatusFilterOption[]>(() =>
    this.statusOptions.map((opt) => ({
      value: opt.value,
      label: this.translate.instant(opt.labelKey),
      count: this.counts()[opt.countKey] ?? 0,
      color: opt.color,
    }))
  );

  readonly createModalOpen = signal(false);
  readonly formError = signal<string | null>(null);

  private searchDebounce?: ReturnType<typeof setTimeout>;

  // ---- the sign-up wizard -------------------------------------------------
  // Three steps, because that is what actually happens at a front desk:
  // who are you, what are you buying, are you paying now. Only the first is
  // compulsory — a walk-in who wants to think about it is still a member.
  readonly step = signal(0);
  readonly moreDetails = signal(false);
  readonly plans = signal<ContractType[]>([]);
  readonly activities = signal<Activity[]>([]);

  readonly subscriptionForm = this.fb.nonNullable.group({
    item: [""],
    contract_type_id: [""],
    starts_on: [new Date().toISOString().slice(0, 10)],
    discount: [0],
    collect_payment: [true],
    payment_method: ["cash"],
  });

  readonly createForm = this.fb.nonNullable.group({
    first_name: ["", Validators.required],
    last_name: ["", Validators.required],
    phone: ["", Validators.required],
    email: [""],
    date_of_birth: [""],
    gender: [""],
    emergency_contact_name: [""],
    emergency_contact_phone: [""],
    notes: [""],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly clientsService: ClientsService,
    private readonly contractTypesService: ContractTypesService,
    private readonly activitiesService: ActivitiesService,
    private readonly branding: BrandingService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly toast: ToastService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.load();
    if (this.route.snapshot.queryParamMap.get("action") === "new") this.openCreate();
  }

  /** Every filter the list is currently narrowed by, in one place. */
  private filters(): ClientFilters {
    return {
      search: this.search() || undefined,
      status: (this.statusFilter() as ClientStatusFilter) || undefined,
      contract_type_id: this.planFilter() || undefined,
      activity_id: this.activityFilter() || undefined,
      gender: this.genderFilter() || undefined,
      joined_from: this.joinedFrom() || undefined,
      joined_to: this.joinedTo() || undefined,
      sort: this.sort(),
      direction: this.direction(),
    };
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.clientsService
      .list({ ...this.filters(), page: this.page() })
      .subscribe({
        next: (res) => {
          this.clients.set(res.clients);
          this.meta.set(res.meta);
          this.counts.set(res.counts ?? {});
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  hasFilters(): boolean {
    return this.search() !== "" || this.statusFilter() !== "" || this.advancedCount() > 0;
  }

  /** How many of the folded-away filters are set — the badge on the toggle. */
  readonly advancedCount = computed(
    () =>
      [this.planFilter(), this.activityFilter(), this.genderFilter(), this.joinedFrom(), this.joinedTo()].filter(
        (value) => value !== ""
      ).length
  );

  readonly filterChips = computed(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (this.search()) chips.push({ label: `« ${this.search()} »`, clear: () => this.onSearchChange("") });
    const st = this.statusFilter();
    if (st) {
      const opt = this.statusOptions.find((o) => o.value === st);
      if (opt) chips.push({ label: this.translate.instant(opt.labelKey), clear: () => this.applyStatusFilter("") });
    }

    const plan = this.plans().find((p) => p.id === this.planFilter());
    if (plan) chips.push({ label: plan.name, clear: () => this.setPlanFilter("") });

    const activity = this.activities().find((a) => a.id === this.activityFilter());
    if (activity) chips.push({ label: activity.name, clear: () => this.setActivityFilter("") });

    if (this.genderFilter()) {
      chips.push({ label: this.genderLabel(this.genderFilter()), clear: () => this.setGenderFilter("") });
    }

    // One chip for the range, however many of its two ends are set: "joined
    // after X" and "joined before Y" are the same filter read twice.
    if (this.joinedFrom() || this.joinedTo()) {
      const from = this.joinedFrom() || "…";
      const to = this.joinedTo() || "…";
      chips.push({
        label: `${this.translate.instant("clients.member_since")} ${from} → ${to}`,
        clear: () => {
          this.joinedFrom.set("");
          this.joinedTo.set("");
          this.reload();
        },
      });
    }

    return chips;
  });

  genderLabel(value: string): string {
    const key = { male: "clients.gender_male", female: "clients.gender_female" }[value];
    return key ? this.translate.instant(key) : value;
  }

  clearFilters(): void {
    this.search.set("");
    this.statusFilter.set("");
    this.planFilter.set("");
    this.activityFilter.set("");
    this.genderFilter.set("");
    this.joinedFrom.set("");
    this.joinedTo.set("");
    this.reload();
  }

  /** Any filter change puts the list back on page one before reloading. */
  private reload(): void {
    this.page.set(1);
    this.load();
  }

  toggleAdvanced(): void {
    this.advancedOpen.set(!this.advancedOpen());
    // The selects are empty until the catalogue is in — load it the first
    // time the drawer opens rather than with every visit to the page.
    if (this.advancedOpen()) this.loadCatalogue();
  }

  setPlanFilter(id: string): void {
    this.planFilter.set(id);
    this.reload();
  }

  setActivityFilter(id: string): void {
    this.activityFilter.set(id);
    this.reload();
  }

  setGenderFilter(value: string): void {
    this.genderFilter.set(value);
    this.reload();
  }

  setJoinedFrom(value: string): void {
    this.joinedFrom.set(value);
    this.reload();
  }

  setJoinedTo(value: string): void {
    this.joinedTo.set(value);
    this.reload();
  }

  /**
   * Clicking a column header sorts by it — and clicking the one already
   * sorted flips the direction, which is what a header click means
   * everywhere else.
   */
  sortBy(column: ClientSort): void {
    if (this.sort() === column) {
      this.direction.set(this.direction() === "asc" ? "desc" : "asc");
    } else {
      this.sort.set(column);
      this.direction.set("asc");
    }
    this.reload();
  }

  /** What a header announces to a screen reader, and what its caret shows. */
  ariaSort(column: ClientSort): "ascending" | "descending" | "none" {
    if (this.sort() !== column) return "none";
    return this.direction() === "asc" ? "ascending" : "descending";
  }

  onSearchChange(term: string): void {
    this.search.set(term);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.reload(), SEARCH_DEBOUNCE_MS);
  }

  applyStatusFilter(status: ClientStatusFilter | ""): void {
    this.statusFilter.set(status);
    this.reload();
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  /**
   * What is true about this member's subscription, in one short phrase.
   *
   * Three columns — plan, payment status, active — were three answers to one
   * question. This is that question answered once, and it leads with whatever
   * needs doing: money owed before an expiry, an expiry before "all good".
   */
  contractState(client: Client): string {
    const contract = client.current_contract;
    if (!contract) return "";

    if (contract.payment_status === "unpaid") return this.translate.instant("payments.status_unpaid");
    if (contract.status === "expired") return this.translate.instant("contract.status_expired");
    if (contract.remaining_bookings !== null) {
      return this.translate.instant("clients.sessions_left", { count: contract.remaining_bookings });
    }
    if (contract.expires_at) {
      const until = new Date(contract.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
      return this.translate.instant("clients.until", { date: until });
    }

    return this.translate.instant("common.active");
  }

  /** Which of those phrases is a problem, for the colour that goes with it. */
  contractTone(client: Client): "danger" | "warning" | "neutral" {
    const contract = client.current_contract;
    if (!contract) return "neutral";
    if (contract.payment_status === "unpaid" || contract.status === "expired") return "danger";
    if (contract.remaining_bookings !== null && contract.remaining_bookings <= 1) return "warning";

    return "neutral";
  }

  /** The colour of a row's left strip — its contract state at a glance. */
  rowColor(client: Client): string {
    if (!client.active) return "var(--color-muted)";
    const contract = client.current_contract;
    if (!contract) return "var(--color-warning)";
    if (contract.status === "expired") return "var(--color-danger)";
    if (contract.payment_status === "unpaid") return "var(--color-info)";
    return "var(--color-success)";
  }

  exportCsv(): void {
    this.clientsService
      .exportCsv(this.filters())
      .subscribe({
        next: (blob) => downloadBlob(blob, `adherents-${new Date().toISOString().slice(0, 10)}.csv`),
        error: () => this.toast.error(this.translate.instant("common.error_generic")),
      });
  }

  openClient(client: Client): void {
    this.router.navigate(["/admin/clients", client.id]);
  }

  openCreate(): void {
    this.createForm.reset();
    this.subscriptionForm.reset({
      item: "",
      contract_type_id: "",
      starts_on: new Date().toISOString().slice(0, 10),
      discount: 0,
      collect_payment: true,
      payment_method: "cash",
    });
    // The selects read these signals, not the form: left alone, the last
    // member's formule came back on the next one.
    this.selectedItem.set("");
    this.selectedPlanId.set("");
    this.discount.set(0);
    this.step.set(0);
    this.moreDetails.set(false);
    this.formError.set(null);
    this.createModalOpen.set(true);
    this.loadCatalogue();
  }

  closeCreateModal(): void {
    this.createModalOpen.set(false);
  }

  // Loaded when the wizard opens rather than with the page: most visits to
  // the member list never sell anything.
  private loadCatalogue(): void {
    if (this.activities().length > 0) return;

    this.activitiesService.list().subscribe((res) => this.activities.set(res.activities.filter((a) => a.active)));
    this.contractTypesService.list().subscribe((res) => this.plans.set(res.plans.filter((p) => p.active)));
  }

  readonly currency = computed(() => this.branding.branding()?.currency ?? "TND");

  readonly wizardSteps = computed(() => [
    this.translate.instant("clients.step_identity"),
    this.translate.instant("clients.step_subscription"),
    this.translate.instant("clients.step_payment"),
  ]);

  /**
   * The packs some formule sells, read off the formules themselves — a pack
   * no formule prices cannot be sold, so it isn't offered.
   */
  readonly packsForSale = computed(() => {
    const labels = new Map<string, string>();
    for (const plan of this.plans()) {
      for (const row of plan.pack_prices ?? []) {
        if (!labels.has(row.pack_id)) labels.set(row.pack_id, `${row.pack_name} (${row.activity_names.join(" + ")})`);
      }
    }
    return [...labels].map(([id, label]) => ({ key: `pack:${id}`, label }));
  });

  /** The plans that actually price the chosen activity or pack — the rest aren't sold for it. */
  readonly plansForItem = computed(() => {
    const key = this.selectedItem();
    if (!key) return [];
    return this.plans().filter((p) => sellableItems(p).some((i) => i.key === key));
  });

  // Mirrors of the two selects, so the computeds below react to them: a
  // reactive form control is not a signal.
  /** A SellableItem key: "activity:<id>" or "pack:<id>". */
  readonly selectedItem = signal("");
  readonly selectedPlanId = signal("");
  readonly discount = signal(0);

  readonly basePrice = computed(() => {
    const plan = this.plans().find((p) => p.id === this.selectedPlanId());
    return sellableItems(plan).find((i) => i.key === this.selectedItem())?.price ?? null;
  });

  readonly total = computed(() => {
    const base = this.basePrice();
    return base === null ? null : Math.max(base - (this.discount() || 0), 0);
  });

  onItemChange(key: string): void {
    this.selectedItem.set(key);
    this.subscriptionForm.patchValue({ item: key });
    // A plan that does not price the new activity or pack cannot stay selected.
    if (!this.plansForItem().some((p) => p.id === this.selectedPlanId())) {
      this.selectedPlanId.set("");
      this.subscriptionForm.patchValue({ contract_type_id: "" });
    }
  }

  onPlanChange(id: string): void {
    this.selectedPlanId.set(id);
    this.subscriptionForm.patchValue({ contract_type_id: id });
  }

  onDiscountChange(value: number): void {
    this.discount.set(value || 0);
    this.subscriptionForm.patchValue({ discount: value || 0 });
  }

  /** True once the step's own requirements are met — never for a later step. */
  canAdvance(): boolean {
    if (this.step() === 0) return this.createForm.valid;
    if (this.step() === 1) return !this.selectedPlanId() || this.total() !== null;
    return true;
  }

  next(): void {
    if (this.step() === 0 && this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    // Nothing was bought, so there is nothing to collect: skip step 3.
    if (this.step() === 1 && !this.selectedPlanId()) {
      this.submitCreate();
      return;
    }
    this.step.set(Math.min(this.step() + 1, 2));
  }

  back(): void {
    this.step.set(Math.max(this.step() - 1, 0));
  }

  goToStep(index: number): void {
    if (index < this.step()) this.step.set(index);
  }

  submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.step.set(0);
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const subscription: EnrolmentSubscription | undefined = this.selectedPlanId()
      ? {
          contract_type_id: this.selectedPlanId(),
          ...sellableTarget(this.selectedItem()),
          starts_on: this.subscriptionForm.getRawValue().starts_on,
          discount: this.discount(),
          collect_payment: this.subscriptionForm.getRawValue().collect_payment,
          payment_method: this.subscriptionForm.getRawValue().payment_method,
        }
      : undefined;

    this.clientsService.create(this.createForm.getRawValue(), subscription).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.createModalOpen.set(false);
        this.toast.success(this.translate.instant("clients.created"));
        this.router.navigate(["/admin/clients", res.client.id]);
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
