import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";
import { DatePipe, DecimalPipe } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Activity } from "../../../core/models/activity.model";
import { Booking, BookingKind } from "../../../core/models/booking.model";
import { ClientDetail } from "../../../core/models/client.model";
import { Contract } from "../../../core/models/contract.model";
import { Payment } from "../../../core/models/payment.model";
import { ContractType, SellableItem, sellableItems, sellableTarget } from "../../../core/models/contract-type.model";
import { Session } from "../../../core/models/session.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { AttendanceService } from "../../../core/services/attendance.service";
import { BookingsService } from "../../../core/services/bookings.service";
import { ClientsService } from "../../../core/services/clients.service";
import { downloadBlob } from "../../../core/services/download.util";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { ContractsService } from "../../../core/services/contracts.service";
import { PaymentsService } from "../../../core/services/payments.service";
import { SessionsService } from "../../../core/services/sessions.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { AvatarComponent } from "../../../shared/components/avatar.component";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { KpiCardComponent } from "../../../shared/ui/kpi-card.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ActionMenuComponent } from "../../../shared/ui/action-menu.component";

// Four tabs, not six. "Bookings" and "Attendance" were the same list read
// twice — what was booked, and whether they turned up — and a note about
// someone belongs with the rest of what you read about them, on the
// overview.
/** What happened, and what kind of thing it was. */
interface TimelineEntry {
  id: string;
  /** ISO. Sessions are dated by when they ran, payments by when money arrived. */
  at: string;
  stream: "sessions" | "payments";
  kind: "attended" | "missed" | "cancelled" | "booked" | "paid" | "refunded";
  title: string;
  detail: string | null;
}

/**
 * A booking's status IS its attendance: `completed` means they came,
 * `no_show` means they did not. There is no separate record to merge in.
 */
const TIMELINE_ICONS: Record<TimelineEntry["kind"], string> = {
  attended: "bi-check2",
  missed: "bi-x",
  cancelled: "bi-slash-circle",
  booked: "bi-calendar-check",
  paid: "bi-cash-coin",
  refunded: "bi-arrow-counterclockwise",
};

const BOOKING_KINDS: Record<string, TimelineEntry["kind"]> = {
  completed: "attended",
  no_show: "missed",
  cancelled: "cancelled",
  confirmed: "booked",
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Component({
  selector: "app-client-profile",
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    RouterLink,
    TranslateModule,
    AvatarComponent,
    EmptyStateComponent,
    ModalComponent,
    MoneyPipe,
    SpinnerComponent,
    StatusBadgeComponent,
    KpiCardComponent,
    SkeletonComponent,
    ErrorStateComponent,
    ActionMenuComponent,
  ],
  templateUrl: "./client-profile.component.html",
  styleUrl: "./client-profile.component.scss",
})
export class ClientProfileComponent implements OnInit {
  /** Taking a member off the gym is the admin's alone (the API refuses anyone else). */
  readonly isAdmin = inject(AuthService).isAdmin;
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);
  readonly client = signal<ClientDetail | null>(null);
  readonly contracts = signal<Contract[]>([]);
  readonly bookings = signal<Booking[]>([]);
  readonly payments = signal<Payment[]>([]);
  readonly contractProgress = signal<{ percent: number; tone: "success" | "warning" | "danger" } | null>(null);
  /**
   * Bookings, payments and attendance were three tabs. They are one story —
   * whether this person still comes, and whether they have paid for it — so
   * they are one stream, newest first.
   *
   * `filter` narrows it without splitting it back up.
   */
  readonly filter = signal<"all" | "sessions" | "payments">("all");

  /** Two letters for the banner's disc — the avatar component is a circle
   *  of its own and would sit oddly inside a coloured block. */
  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  /** The mark beside a timeline entry — one icon per kind of event. */
  timelineIcon(kind: TimelineEntry["kind"]): string {
    return TIMELINE_ICONS[kind];
  }

  readonly timeline = computed<TimelineEntry[]>(() => {
    const sessions: TimelineEntry[] = this.bookings().map((booking) => ({
      id: `b-${booking.id}`,
      at: booking.session.starts_at,
      stream: "sessions" as const,
      kind: BOOKING_KINDS[booking.status] ?? "booked",
      title: `${booking.session.activity_emoji ? booking.session.activity_emoji + " " : ""}${booking.session.activity_name}`,
      detail: this.coveredBy(booking),
    }));

    const money: TimelineEntry[] = this.payments().map((payment) => ({
      id: `p-${payment.id}`,
      // A recorded payment is dated by when the money arrived, not by when
      // someone typed it in.
      at: payment.paid_at ?? payment.created_at,
      stream: "payments" as const,
      kind: payment.status === "refunded" ? "refunded" : "paid",
      title: `${Number(payment.amount)} ${payment.currency}`,
      detail: payment.product_name,
    }));

    const all = [...sessions, ...money];
    const chosen = this.filter() === "all" ? all : all.filter((entry) => entry.stream === this.filter());

    return chosen.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  });

  readonly contractTypes = signal<ContractType[]>([]);
  readonly activities = signal<Activity[]>([]);
  readonly availableSessions = signal<Session[]>([]);

  // One display row per abonnement — progress captured once (computed only
  // re-runs when contracts() changes, so no ECAIHBC from Date.now()).
  readonly aboRows = computed(() => {
    const now = Date.now();
    return this.contracts().map((c) => {
      const start = new Date(c.starts_at ?? 0).getTime();
      const end = new Date(c.expires_at ?? 0).getTime();
      const span = end - start;
      const percent = span > 0 ? Math.min(100, Math.max(0, ((now - start) / span) * 100)) : 100;
      const daysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000));
      const remaining = c.remaining_bookings;
      const sessionCount = c.plan.session_count;
      return { contract: c, percent, daysLeft, remaining, sessionCount };
    });
  });

  readonly contractModalOpen = signal(false);
  readonly editModalOpen = signal(false);
  readonly editingContract = signal<Contract | null>(null);
  readonly bookingModalOpen = signal(false);
  readonly paymentModalOpen = signal(false);
  readonly formError = signal<string | null>(null);

  // Fitora only takes cash payments in the gym — there is no method selector.
  // No part payments: "Encaisser maintenant" records the full price.
  readonly contractForm = this.fb.nonNullable.group({
    contract_type_id: [null as string | null, Validators.required],
    /** What the formule is sold for: a SellableItem key — an activity, or a pack. */
    item: [null as string | null, Validators.required],
    starts_on: [toDateInputValue(new Date()), Validators.required],
    discount: [0],
    collect_payment: [false],
  });

  readonly editForm = this.fb.nonNullable.group({
    starts_on: ["", Validators.required],
    expires_on: ["", Validators.required],
    discount: [0],
  });

  readonly bookingForm = this.fb.nonNullable.group({
    activity_id: [null as string | null, Validators.required],
    date: [toDateInputValue(new Date()), Validators.required],
    session_id: [null as string | null, Validators.required],
    /** How the seat is paid for — see BookingsService.create. */
    kind: ["contract" as BookingKind],
  });

  // ---- the health file ----------------------------------------------------
  // What a coach must know before an EMS or reformer session, and when the
  // member signed the studio's declaration. This gym's own copy.
  readonly healthModalOpen = signal(false);
  readonly healthForm = this.fb.nonNullable.group({
    health_notes: [""],
    waiver_signed_on: [""],
  });

  readonly paymentPayableOptions = signal<{ kind: "contract" | "booking"; id: string; label: string; amountDue: number }[]>([]);
  readonly paymentForm = this.fb.nonNullable.group({
    payable_key: ["", Validators.required],
    notes: [""],
  });

  // ---- the member's own app -----------------------------------------------
  // Off unless the gym switches it on, from here — by inviting them. The
  // member chooses their own password from the emailed link. It comes with
  // Fitora Pro: on Starter the entry says so instead of offering a button the
  // backend would refuse.
  private readonly configuration = inject(ConfigurationService);
  readonly memberApp = this.configuration.memberApp;
  /** Whether the desk may book a trial or a single paid session (Settings → Booking). */
  readonly dropIn = computed(() => this.configuration.features()["drop_in"] !== false);
  readonly pausing = signal(false);
  readonly inviting = signal(false);
  readonly removing = signal(false);

  private readonly router = inject(Router);

  private clientId!: string;

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly clientsService: ClientsService,
    private readonly contractTypesService: ContractTypesService,
    private readonly contractsService: ContractsService,
    private readonly activitiesService: ActivitiesService,
    private readonly sessionsService: SessionsService,
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
    private readonly attendanceService: AttendanceService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.clientId = this.route.snapshot.paramMap.get("id")!;
    this.contractTypesService.list().subscribe((res) => this.contractTypes.set(res.plans));
    this.activitiesService.list().subscribe((res) => this.activities.set(res.activities));
    this.load();

    this.bookingForm.controls.activity_id.valueChanges.subscribe(() => this.onBookingFiltersChange());
    // A new formule may not sell what was picked under the last one; when it
    // sells a single thing, that thing is the answer.
    this.contractForm.controls.contract_type_id.valueChanges.subscribe(() => {
      const items = this.saleItems();
      const current = this.contractForm.controls.item.value;
      if (items.some((i) => i.key === current)) return;
      this.contractForm.controls.item.setValue(items.length === 1 ? items[0].key : null);
    });
    this.bookingForm.controls.date.valueChanges.subscribe(() => this.onBookingFiltersChange());
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.clientsService.get(this.clientId).subscribe({
      next: (res) => {
        this.client.set(res.client);
        this.contracts.set(res.contracts);
        this.bookings.set(res.bookings);
        this.payments.set(res.payments);
        this.contractProgress.set(res.client.current_contract ? this.computeContractProgress(res.client.current_contract) : null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }


  async inviteToApp(): Promise<void> {
    const client = this.client();
    if (!client?.email) return;

    const confirmed = await this.confirm.ask({
      title: this.translate.instant("clients.invite_confirm_title"),
      body: this.translate.instant("clients.invite_confirm_body", { email: client.email }),
    });
    if (!confirmed) return;

    this.inviting.set(true);
    this.clientsService.invite(this.clientId).subscribe({
      next: () => {
        this.inviting.set(false);
        this.toast.success(this.translate.instant("clients.invite_sent", { email: client.email }));
        this.load();
      },
      error: (err) => {
        this.inviting.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  /** Takes them off this gym — see ClientsService.remove. */
  async removeMember(): Promise<void> {
    const client = this.client();
    if (!client) return;

    const confirmed = await this.confirm.ask({
      title: this.translate.instant("clients.remove_confirm_title", { name: client.full_name }),
      body: this.translate.instant("clients.remove_confirm_body"),
      confirmLabel: this.translate.instant("clients.remove"),
      danger: true,
    });
    if (!confirmed) return;

    this.removing.set(true);
    this.clientsService.remove(this.clientId).subscribe({
      next: () => {
        this.removing.set(false);
        this.toast.success(this.translate.instant("clients.removed", { name: client.full_name }));
        this.router.navigateByUrl("/admin/clients");
      },
      error: (err) => {
        this.removing.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  balanceTone(balance: number): "success" | "danger" {
    return balance > 0 ? "danger" : "success";
  }

  // Renewal urgency shown as a progress bar on the overview tab, so an admin
  // glancing at a client's profile can spot an expiring contract without
  // opening the Contrats tab. Computed once per load() (not in the template)
  // since it's Date.now()-based and would otherwise drift between change
  // detection passes and trip ExpressionChangedAfterItHasBeenCheckedError.
  private computeContractProgress(contract: { starts_at: string | null; expires_at: string | null }): { percent: number; tone: "success" | "warning" | "danger" } {
    const start = new Date(contract.starts_at ?? 0).getTime();
    const end = new Date(contract.expires_at ?? 0).getTime();
    const total = end - start;
    const percent = total > 0 ? Math.min(100, Math.max(0, ((Date.now() - start) / total) * 100)) : 100;
    const remaining = 100 - percent;
    const tone = remaining < 10 ? "danger" : remaining < 30 ? "warning" : "success";
    return { percent, tone };
  }

  // === Abonnements ===
  selectedPlan(): ContractType | null {
    const id = this.contractForm.controls.contract_type_id.value;
    return this.contractTypes().find((p) => p.id === id) ?? null;
  }

  /** What the chosen formule can be sold for — its activities, then its packs. */
  saleItems(): SellableItem[] {
    return sellableItems(this.selectedPlan());
  }

  // What the chosen activity or pack costs under the chosen plan. null means
  // the gym doesn't sell that plan for it — the backend refuses it too, so
  // the form blocks instead of inventing a price.
  selectedItemPrice(): number | null {
    const key = this.contractForm.controls.item.value;
    return this.saleItems().find((i) => i.key === key)?.price ?? null;
  }

  // Price after the discount typed in the create form, clamped at 0. Indicative
  // only: the API re-reads the tariff and decides what is actually billed.
  contractFormTotal(): number {
    const price = this.selectedItemPrice();
    if (price === null) return 0;
    return Math.max(0, price - (this.contractForm.controls.discount.value || 0));
  }

  openContractModal(): void {
    this.contractForm.reset({ starts_on: toDateInputValue(new Date()), discount: 0, collect_payment: false });
    this.formError.set(null);
    this.contractModalOpen.set(true);
  }

  closeContractModal(): void {
    this.contractModalOpen.set(false);
  }

  submitContract(): void {
    if (this.contractForm.invalid) {
      this.contractForm.markAllAsTouched();
      return;
    }

    const { contract_type_id, item, starts_on, discount, collect_payment } = this.contractForm.getRawValue();
    this.saving.set(true);
    this.formError.set(null);

    this.contractsService
      .create({
        client_id: this.clientId,
        contract_type_id: contract_type_id!,
        ...sellableTarget(item),
        starts_on,
        discount: discount || 0,
        collect_payment: collect_payment || undefined,
        payment_method: collect_payment ? "cash" : undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.contractModalOpen.set(false);
          this.toast.success(this.translate.instant("common.save"));
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }

  openEditModal(contract: Contract): void {
    this.editingContract.set(contract);
    this.editForm.reset({
      starts_on: (contract.starts_at ?? "").slice(0, 10),
      expires_on: (contract.expires_at ?? "").slice(0, 10),
      discount: parseFloat(contract.discount) || 0,
    });
    if (contract.payment_status === "paid") this.editForm.controls.discount.disable();
    else this.editForm.controls.discount.enable();
    this.formError.set(null);
    this.editModalOpen.set(true);
  }

  closeEditModal(): void {
    this.editModalOpen.set(false);
    this.editingContract.set(null);
  }

  submitEdit(): void {
    const contract = this.editingContract();
    if (!contract || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const { starts_on, expires_on, discount } = this.editForm.getRawValue();
    this.saving.set(true);
    this.formError.set(null);

    this.contractsService
      .update(contract.id, {
        starts_on,
        expires_on,
        discount: this.editForm.controls.discount.disabled ? undefined : discount || 0,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.closeEditModal();
          this.toast.success(this.translate.instant("common.save"));
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }

  async collectPayment(contract: Contract): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("clients.collect_confirm_title"),
      body: this.translate.instant("clients.collect_confirm_body", { amount: contract.amount_due }),
    });
    if (!confirmed) return;

    this.paymentsService
      .record({ client_id: this.clientId, payment_method: "cash", contract_id: contract.id })
      .subscribe({
        next: () => {
          this.toast.success(this.translate.instant("common.save"));
          this.load();
        },
        error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
      });
  }

  downloadReceipt(contract: Contract): void {
    this.contractsService.receipt(contract.id).subscribe({
      next: (blob) => downloadBlob(blob, `facture-${contract.invoice_ref}.pdf`),
      error: () => this.toast.error(this.translate.instant("common.error_generic")),
    });
  }

  /** The contract to sign, already signed by the gym (its default signature). */
  downloadAgreement(contract: Contract): void {
    this.contractsService.agreement(contract.id).subscribe({
      next: (blob) => downloadBlob(blob, `contrat-${contract.invoice_ref}.pdf`),
      error: () => this.toast.error(this.translate.instant("common.error_generic")),
    });
  }

  async renewContract(contract: Contract): Promise<void> {
    // The backend refuses anything else — see Contract#renewable?.
    if (!contract.renewable) return;
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("contracts.renew_confirm_title"),
      body: this.translate.instant("contracts.renew_confirm_body"),
    });
    if (!confirmed) return;

    this.contractsService.renew(contract.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.save"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

  async cancelContract(contract: Contract): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("contracts.cancel_confirm_title"),
      body: this.translate.instant("contracts.cancel_confirm_body"),
      danger: true,
    });
    if (!confirmed) return;

    this.contractsService.cancel(contract.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.confirm"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

  async deleteContract(contract: Contract): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("contracts.delete_confirm_title"),
      body: this.translate.instant("contracts.delete_confirm_body"),
      danger: true,
    });
    if (!confirmed) return;

    this.contractsService.destroy(contract.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.confirm"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

  /** What paid for a booking, in words, for the timeline. */
  private coveredBy(booking: Booking): string | null {
    const covered = booking.covered_by;
    if (!covered) return null;
    if (covered.type === "contract") return covered.name;
    return this.translate.instant(`bookings.kind_${covered.type}`);
  }

  // === Pause ===
  /**
   * A membership on hold — an injury, a pregnancy, a month away. Nothing
   * books against it, and resuming gives the held days back.
   */
  async togglePause(contract: Contract): Promise<void> {
    const pausing = !contract.paused;
    if (pausing) {
      const confirmed = await this.confirm.ask({
        title: this.translate.instant("contracts.pause_confirm_title"),
        body: this.translate.instant("contracts.pause_confirm_body", { name: contract.client.full_name }),
      });
      if (!confirmed) return;
    }

    this.pausing.set(true);
    const request = pausing ? this.contractsService.pause(contract.id) : this.contractsService.resume(contract.id);
    request.subscribe({
      next: () => {
        this.pausing.set(false);
        this.toast.success(this.translate.instant(pausing ? "contracts.paused_done" : "contracts.resumed_done"));
        this.load();
      },
      error: (err) => {
        this.pausing.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // === Health ===
  openHealthModal(): void {
    const client = this.client();
    this.healthForm.reset({
      health_notes: client?.health_notes ?? "",
      waiver_signed_on: client?.waiver_signed_on ?? "",
    });
    this.formError.set(null);
    this.healthModalOpen.set(true);
  }

  closeHealthModal(): void {
    this.healthModalOpen.set(false);
  }

  /** Today, for the "signed today" shortcut — the usual case at a first visit. */
  signWaiverToday(): void {
    this.healthForm.controls.waiver_signed_on.setValue(toDateInputValue(new Date()));
  }

  submitHealth(): void {
    const { health_notes, waiver_signed_on } = this.healthForm.getRawValue();
    this.saving.set(true);
    this.formError.set(null);

    this.clientsService
      .update(this.clientId, { health_notes: health_notes.trim() || null, waiver_signed_on: waiver_signed_on || null })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.healthModalOpen.set(false);
          this.toast.success(this.translate.instant("common.saved"));
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }

  // === Booking ===
  openBookingModal(): void {
    // Someone with nothing to book against is, at a studio, almost always
    // there for a first session: start from the trial rather than a refusal.
    const covered = !!this.client()?.current_contract && !this.client()?.current_contract?.paused;
    const kind: BookingKind = covered || !this.dropIn() ? "contract" : "trial";
    this.bookingForm.reset({ date: toDateInputValue(new Date()), kind });
    this.availableSessions.set([]);
    this.formError.set(null);
    this.bookingModalOpen.set(true);
  }

  closeBookingModal(): void {
    this.bookingModalOpen.set(false);
  }

  onBookingFiltersChange(): void {
    const { activity_id, date } = this.bookingForm.getRawValue();
    this.bookingForm.patchValue({ session_id: null }, { emitEvent: false });
    if (!activity_id || !date) {
      this.availableSessions.set([]);
      return;
    }
    this.sessionsService.list({ activity_id, date, status: "scheduled" }).subscribe((res) => this.availableSessions.set(res.sessions));
  }

  submitBooking(): void {
    if (this.bookingForm.invalid) {
      this.bookingForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const { session_id, kind } = this.bookingForm.getRawValue();
    this.bookingsService.create(this.clientId, session_id!, kind).subscribe({
      next: () => {
        this.saving.set(false);
        this.bookingModalOpen.set(false);
        this.toast.success(this.translate.instant("common.save"));
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  async cancelBooking(booking: Booking): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("bookings.cancel_confirm_title"),
      body: this.translate.instant("bookings.cancel_confirm_body"),
      danger: true,
    });
    if (!confirmed) return;

    this.bookingsService.cancel(booking.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.confirm"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

  // === Payment (bookings & one-offs — abonnements are settled from their card) ===
  openPaymentModal(): void {
    this.paymentForm.reset();
    // Each contract is one term with its own price, so whatever is owed on
    // one — a renewal sold early included — is offered on its own line.
    const contracts = this.contracts()
      .filter((c) => Number(c.amount_due) > 0)
      .map((c) => ({ kind: "contract" as const, id: c.id, label: `${this.translate.instant("contracts.title")} — ${c.plan.name}`, amountDue: Number(c.amount_due) }));
    const bookings = this.bookings()
      .filter((b) => b.payment_status !== "paid" && b.amount > 0)
      .map((b) => ({ kind: "booking" as const, id: b.id, label: `${this.translate.instant("bookings.title")} — ${b.session.activity_name}`, amountDue: b.amount }));
    this.paymentPayableOptions.set([...contracts, ...bookings]);
    this.formError.set(null);
    this.paymentModalOpen.set(true);
  }

  closePaymentModal(): void {
    this.paymentModalOpen.set(false);
  }

  submitPayment(): void {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    const { payable_key, notes } = this.paymentForm.getRawValue();
    const [kind, id] = payable_key.split(":");

    this.saving.set(true);
    this.formError.set(null);

    this.paymentsService
      .record({
        client_id: this.clientId,
        payment_method: "cash",
        notes: notes || undefined,
        contract_id: kind === "contract" ? id : undefined,
        booking_id: kind === "booking" ? id : undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.paymentModalOpen.set(false);
          this.toast.success(this.translate.instant("common.save"));
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }

  // === Check-in ===
  checkIn(): void {
    const today = toDateInputValue(new Date());
    const todaysBooking = this.bookings().find((b) => b.status === "confirmed" && b.session.starts_at.slice(0, 10) === today);

    if (!todaysBooking) {
      this.toast.info(this.translate.instant("clients.no_session_today"));
      return;
    }

    this.attendanceService.mark(todaysBooking.id, "present").subscribe({
      next: () => {
        this.toast.success(this.translate.instant("coach.attendance_present"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

}
