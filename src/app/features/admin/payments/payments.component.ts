import { Component, OnInit, computed, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Client, ClientDetail } from "../../../core/models/client.model";
import { Payment } from "../../../core/models/payment.model";
import { ClientsService } from "../../../core/services/clients.service";
import { PaymentsService } from "../../../core/services/payments.service";
import { PageMeta } from "../../../core/services/sessions.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { AvatarComponent } from "../../../shared/components/avatar.component";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { PaginationComponent } from "../../../shared/components/pagination.component";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { HighlightPipe } from "../../../shared/pipes/highlight.pipe";
import { SEARCH_DEBOUNCE_MS } from "../../../shared/utils/client-list";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { BrandingService } from "../../../core/services/branding.service";
import { StatusFilterComponent, StatusFilterOption } from "../../../shared/ui/status-filter.component";
import { ActionMenuComponent } from "../../../shared/ui/action-menu.component";

type PayableOption = { kind: "contract" | "booking"; id: string; label: string; amountDue: number };

@Component({
  selector: "app-admin-payments",
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    RouterLink,
    TranslateModule,
    AvatarComponent,
    EmptyStateComponent,
    ModalComponent,
    PaginationComponent,
    MoneyPipe,
    SpinnerComponent,
    StatusBadgeComponent,
    HighlightPipe,
    SkeletonComponent,
    ErrorStateComponent,
    StatusFilterComponent,
    ActionMenuComponent,
  ],
  templateUrl: "./payments.component.html",
})
export class AdminPaymentsComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly payments = signal<Payment[]>([]);
  readonly meta = signal<PageMeta | null>(null);
  readonly statusFilter = signal<string>("");
  readonly page = signal(1);
  readonly search = signal("");
  private searchDebounce?: ReturnType<typeof setTimeout>;

  readonly statusOptions: { value: string; labelKey: string; color: string }[] = [
    { value: "", labelKey: "common.all", color: "var(--color-primary)" },
    { value: "paid", labelKey: "payments.status_paid", color: "var(--color-success)" },
    { value: "refunded", labelKey: "payments.status_refunded", color: "var(--color-info)" },
    { value: "cancelled", labelKey: "payments.status_cancelled", color: "var(--color-muted)" },
  ];

  /**
   * The method tabs above the grid. No card: Fitora takes nothing online, and
   * the API refuses `card` — offering it here only produced a filter that
   * matched nothing and a choice that failed on save.
   */
  readonly methodOptions: { value: string; labelKey: string; color: string }[] = [
    { value: "cash", labelKey: "payments.method_cash", color: "var(--color-success)" },
    { value: "bank_transfer", labelKey: "payments.method_bank_transfer", color: "var(--color-info)" },
    { value: "other", labelKey: "payments.method_other", color: "var(--color-muted)" },
  ];

  readonly counts = signal<Record<string, number>>({});
  readonly currency = computed(() => this.branding.branding()?.currency ?? "TND");
  readonly methodCounts = signal<Record<string, number>>({});
  readonly methodFilter = signal<string>("");
  readonly totals = signal({
    collected_this_month: 0,
    collected_total: 0,
    refunded_value: 0,
    cancelled_value: 0,
    average_payment: 0,
  });

  readonly railOptions = computed<StatusFilterOption[]>(() =>
    this.statusOptions.map((opt) => ({
      value: opt.value,
      label: this.translate.instant(opt.labelKey),
      count: this.counts()[opt.value || "all"] ?? 0,
      color: opt.color,
    }))
  );

  readonly recordModalOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly clientSearch = signal("");
  readonly clientResults = signal<Client[]>([]);
  readonly selectedClient = signal<ClientDetail | null>(null);
  readonly payableOptions = signal<PayableOption[]>([]);

  // Fitora only takes cash payments in the gym — see payments.component.html,
  // there's no method selector in the form anymore.
  readonly recordForm = this.fb.nonNullable.group({
    payable_key: ["", Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    notes: [""],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly paymentsService: PaymentsService,
    private readonly branding: BrandingService,
    private readonly clientsService: ClientsService,
    private readonly toast: ToastService,
    private readonly confirm: ConfirmService,
    private readonly translate: TranslateService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.load();
    this.recordForm.controls.payable_key.valueChanges.subscribe((key) => this.onPayableChange(key));
    if (this.route.snapshot.queryParamMap.get("action") === "new") this.openRecordModal();
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  applyStatusFilter(status: string): void {
    this.statusFilter.set(status);
    this.applyFilters();
  }

  hasFilters(): boolean {
    return this.search() !== "" || this.statusFilter() !== "" || this.methodFilter() !== "";
  }

  resetFilters(): void {
    this.search.set("");
    this.statusFilter.set("");
    this.methodFilter.set("");
    this.applyFilters();
  }

  readonly filterChips = computed(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (this.search()) chips.push({ label: `« ${this.search()} »`, clear: () => this.onSearchChange("") });
    const status = this.statusFilter();
    if (status) {
      const opt = this.statusOptions.find((o) => o.value === status);
      if (opt) chips.push({ label: this.translate.instant(opt.labelKey), clear: () => this.applyStatusFilter("") });
    }
    const method = this.methodFilter();
    if (method) {
      const opt = this.methodOptions.find((o) => o.value === method);
      if (opt) chips.push({ label: this.translate.instant(opt.labelKey), clear: () => this.applyMethodFilter("") });
    }
    return chips;
  });

  onSearchChange(term: string): void {
    this.search.set(term);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, SEARCH_DEBOUNCE_MS);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.paymentsService
      .list({
        status: this.statusFilter() || undefined,
        payment_method: this.methodFilter() || undefined,
        q: this.search() || undefined,
        page: this.page(),
      })
      .subscribe({
      next: (res) => {
        this.payments.set(res.payments);
        this.meta.set(res.meta);
        this.counts.set(res.counts ?? {});
        this.methodCounts.set(res.method_counts ?? {});
        if (res.totals) this.totals.set(res.totals);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  applyMethodFilter(method: string): void {
    this.methodFilter.set(method);
    this.page.set(1);
    this.load();
  }

  methodCount(method: string): number {
    return this.methodCounts()[method] ?? 0;
  }

  /** A receipt's strip: collected, refunded, or cancelled. */
  rowColor(payment: Payment): string {
    if (payment.status === "refunded") return "var(--color-info)";
    if (payment.status === "cancelled") return "var(--color-muted)";
    return "var(--color-success)";
  }

  async refund(payment: Payment): Promise<void> {
    const ok = await this.confirm.ask({
      title: this.translate.instant("payments.refund_confirm_title"),
      body: this.translate.instant("payments.refund_confirm_body"),
      danger: true,
    });
    if (!ok) return;

    this.paymentsService.refund(payment.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("payments.refunded_toast"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.load();
  }

  openRecordModal(): void {
    this.recordForm.reset({ amount: 0 });
    this.clientSearch.set("");
    this.clientResults.set([]);
    this.selectedClient.set(null);
    this.payableOptions.set([]);
    this.formError.set(null);
    this.recordModalOpen.set(true);
  }

  closeRecordModal(): void {
    this.recordModalOpen.set(false);
  }

  searchClients(term: string): void {
    this.clientSearch.set(term);
    if (term.trim().length < 2) {
      this.clientResults.set([]);
      return;
    }
    this.clientsService.list({ search: term }).subscribe((res) => this.clientResults.set(res.clients));
  }

  selectClient(client: Client): void {
    this.clientResults.set([]);
    this.clientSearch.set(client.full_name);
    this.clientsService.get(client.id).subscribe((res) => {
      this.selectedClient.set(res.client);
      const contractOptions: PayableOption[] = res.contracts
        .filter((m) => Number(m.amount_due) > 0)
        .map((m) => ({
          kind: "contract",
          id: m.id,
          label: `${this.translate.instant("contracts.title")} — ${m.plan.name}`,
          amountDue: parseFloat(m.final_price),
        }));
      const bookingOptions: PayableOption[] = res.bookings
        .filter((b) => b.payment_status !== "paid" && b.amount > 0)
        .map((b) => ({ kind: "booking", id: b.id, label: `${this.translate.instant("bookings.title")} — ${b.session.activity_name}`, amountDue: b.amount }));
      this.payableOptions.set([...contractOptions, ...bookingOptions]);
    });
  }

  onPayableChange(key: string): void {
    const option = this.payableOptions().find((o) => `${o.kind}:${o.id}` === key);
    if (option) this.recordForm.patchValue({ amount: option.amountDue });
  }

  submitRecord(): void {
    const client = this.selectedClient();
    if (!client || this.recordForm.invalid) {
      this.recordForm.markAllAsTouched();
      return;
    }

    const { payable_key, amount, notes } = this.recordForm.getRawValue();
    const [kind, id] = payable_key.split(":");

    this.saving.set(true);
    this.formError.set(null);

    this.paymentsService
      .record({
        client_id: client.id,
        amount,
        payment_method: "cash",
        notes: notes || undefined,
        contract_id: kind === "contract" ? id : undefined,
        booking_id: kind === "booking" ? id : undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.recordModalOpen.set(false);
          this.toast.success(this.translate.instant("common.save"));
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }
}
