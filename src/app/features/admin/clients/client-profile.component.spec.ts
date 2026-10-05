import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Activity } from "../../../core/models/activity.model";
import { Booking } from "../../../core/models/booking.model";
import { ClientDetail } from "../../../core/models/client.model";
import { Contract } from "../../../core/models/contract.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { Payment } from "../../../core/models/payment.model";
import { Session } from "../../../core/models/session.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { AttendanceService } from "../../../core/services/attendance.service";
import { BookingsService } from "../../../core/services/bookings.service";
import { ClientsService } from "../../../core/services/clients.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { ContractsService } from "../../../core/services/contracts.service";
import { PaymentsService } from "../../../core/services/payments.service";
import { SessionsService } from "../../../core/services/sessions.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ClientProfileComponent } from "./client-profile.component";

describe("ClientProfileComponent", () => {
  let fixture: ComponentFixture<ClientProfileComponent>;
  let component: ClientProfileComponent;
  let clientsService: jasmine.SpyObj<ClientsService>;
  let contractTypesService: jasmine.SpyObj<ContractTypesService>;
  let contractsService: jasmine.SpyObj<ContractsService>;
  let activitiesService: jasmine.SpyObj<ActivitiesService>;
  let sessionsService: jasmine.SpyObj<SessionsService>;
  let bookingsService: jasmine.SpyObj<BookingsService>;
  let paymentsService: jasmine.SpyObj<PaymentsService>;
  let attendanceService: jasmine.SpyObj<AttendanceService>;
  let confirmService: ConfirmService;
  let toast: ToastService;

  const contractType: ContractType = {
    id: "ct1", company_id: "1", name: "Basic", description: null, currency: "TND",
    billing_period: "monthly", duration_days: 30, validity_days: null, session_count: 8, unlimited_bookings: false,
    booking_limit: null, priority_booking: false, color: "#000", active: true, activity_ids: [],
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 100 }],
    pack_prices: [],
  };
  // Sells one activity and one pack, so nothing is picked for the desk.
  const withPack: ContractType = {
    ...contractType, id: "ct2", name: "Duo",
    pack_prices: [{ pack_id: "p1", pack_name: "Duo", activity_names: ["Boxe", "Yoga"], price: 150 }],
  };
  const activity: Activity = {
    id: "a1", company_id: "1", name: "Yoga", emoji: "🧘", description: null,
    session_format: "collective", duration: 60, capacity: 20, active: true,
  } as never;
  const contract: Contract = {
    id: "m1", invoice_ref: "FAC-2026-0001", status: "active", paused: false, paused_at: null,
    starts_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    expires_at: new Date(Date.now() + 25 * 86_400_000).toISOString(),
    remaining_bookings: 5, auto_renew: true, discount: "0", base_price: "100", final_price: "100",
    payment_status: "paid", amount_due: "0", plan: contractType,
    activity: { id: activity.id, name: activity.name, emoji: activity.emoji },
    all_access: false, renewed_from_id: null, renewal: null, renewable: true,
    activity_label: activity.name,
    client: { id: "cl1", full_name: "Amy", phone: null },
  };
  const session: Session = { id: "s1", starts_at: "2026-01-05T10:00:00Z", ends_at: "2026-01-05T11:00:00Z" } as never;
  const booking: Booking = {
    id: "b1", status: "confirmed", amount: 20, currency: "TND", payment_status: "unpaid",
    created_at: "2026-01-01T00:00:00Z", covered_by: null,
    client: { id: "cl1", full_name: "Amy Client", email: null, phone: null },
    session: { id: "s1", starts_at: new Date().toISOString(), ends_at: "2026-01-01T11:00:00Z", status: "scheduled", activity_name: "Yoga", activity_emoji: "🧘", company_name: "Main", company_id: "g1",  coach_name: null },
  };
  const payment: Payment = {
    id: "pay1", amount: 20, currency: "TND", payment_method: "cash", status: "paid", notes: null,
    paid_at: "2026-01-01", created_at: "2026-01-01", client: { id: "cl1", full_name: "Amy", phone: null },
    company: { id: "co1", name: "Acme" }, created_by: null, product_name: null,
  };
  const client: ClientDetail = {
    id: "cl1", first_name: "Amy", last_name: "Client", full_name: "Amy Client", email: null, phone: "123",
    active: true, login_enabled: false,
    joined_at: "2026-01-01",
    current_contract: contract, date_of_birth: null, gender: null, address: null,
    emergency_contact_name: null, emergency_contact_phone: null, notes: "some notes",
    health_notes: null, waiver_signed_on: null,
    outstanding_balance: "0", attendance_rate: null, last_visit_at: null,
    identity_locked: false, invitation_pending: false, invited_at: null,
  };

  // Whether the account's plan opens the member app (Pro, or a trial).
  const memberApp = signal(true);
  const features = signal<Record<string, boolean>>({ drop_in: true });

  beforeEach(async () => {
    memberApp.set(true);
    features.set({ drop_in: true });
    clientsService = jasmine.createSpyObj<ClientsService>("ClientsService", ["get", "update", "invite", "remove"]);
    contractTypesService = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list"]);
    contractsService = jasmine.createSpyObj<ContractsService>("ContractsService", ["create", "update", "renew", "cancel", "destroy", "receipt", "pause", "resume"]);
    activitiesService = jasmine.createSpyObj<ActivitiesService>("ActivitiesService", ["list"]);
    sessionsService = jasmine.createSpyObj<SessionsService>("SessionsService", ["list"]);
    bookingsService = jasmine.createSpyObj<BookingsService>("BookingsService", ["create", "cancel"]);
    paymentsService = jasmine.createSpyObj<PaymentsService>("PaymentsService", ["record"]);
    attendanceService = jasmine.createSpyObj<AttendanceService>("AttendanceService", ["mark"]);

    clientsService.get.and.returnValue(of({ client, contracts: [contract], bookings: [booking], payments: [payment] }));
    contractTypesService.list.and.returnValue(of({ plans: [contractType, withPack] }));
    activitiesService.list.and.returnValue(of({ activities: [activity] }));
    // Default stub — the booking form's activity/date valueChanges are wired
    // up in ngOnInit, so any incidental patch of those fields (e.g. in
    // submitBooking tests below) fires onBookingFiltersChange() too.
    sessionsService.list.and.returnValue(of({ sessions: [], meta: { page: 1, per_page: 20, total: 0, total_pages: 1 } }));

    await TestBed.configureTestingModule({
      imports: [ClientProfileComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ClientsService, useValue: clientsService },
        { provide: ContractTypesService, useValue: contractTypesService },
        { provide: ContractsService, useValue: contractsService },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: BookingsService, useValue: bookingsService },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: AttendanceService, useValue: attendanceService },
        { provide: ConfigurationService, useValue: { memberApp, features } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: "cl1" }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientProfileComponent);
    component = fixture.componentInstance;
    confirmService = TestBed.inject(ConfirmService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it("loads the client bundle, contract types and activities on init", () => {
    expect(component.client()).toEqual(client);
    expect(component.contracts()).toEqual([contract]);
    expect(component.contractTypes().length).toBe(2);
    expect(component.activities().length).toBe(1);
    expect(component.contractProgress()).not.toBeNull();
  });

  it("sets the error flag when loading fails", () => {
    clientsService.get.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  describe("the timeline", () => {
    it("tells one story out of bookings and payments, newest first", () => {
      expect(component.timeline().length).toBe(component.bookings().length + component.payments().length);

      const dates = component.timeline().map((e) => new Date(e.at).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
    });

    it("reads a booking's status as whether they turned up", () => {
      const kinds = component.timeline().filter((e) => e.stream === "sessions").map((e) => e.kind);

      expect(kinds.every((k) => ["attended", "missed", "cancelled", "booked"].includes(k))).toBe(true);
    });

    it("narrows without splitting the story back into tabs", () => {
      component.filter.set("payments");
      expect(component.timeline().every((e) => e.stream === "payments")).toBe(true);

      component.filter.set("sessions");
      expect(component.timeline().every((e) => e.stream === "sessions")).toBe(true);

      component.filter.set("all");
      expect(component.timeline().length).toBeGreaterThan(0);
    });

    it("gives every kind of event its own mark", () => {
      const kinds = ["attended", "missed", "cancelled", "booked", "paid", "refunded"] as const;
      const icons = kinds.map((k) => component.timelineIcon(k));

      expect(icons.every((i) => i.startsWith("bi-"))).toBe(true);
      expect(new Set(icons).size).toBe(kinds.length);
    });
  });

  it("balanceTone is danger for a positive balance, success otherwise", () => {
    expect(component.balanceTone(10)).toBe("danger");
    expect(component.balanceTone(0)).toBe("success");
  });

  it("aboRows maps each contract to a progress row", () => {
    const rows = component.aboRows();
    expect(rows.length).toBe(1);
    expect(rows[0].sessionCount).toBe(8);
  });

  it("aboRows falls back to epoch dates and 100% for a contract with no start/end", () => {
    component.contracts.set([{ ...contract, starts_at: null, expires_at: null }]);
    const rows = component.aboRows();
    expect(rows[0].percent).toBe(100);
  });

  it("load() falls back to an empty note and a null progress when the client has neither", () => {
    clientsService.get.and.returnValue(
      of({ client: { ...client, notes: null, current_contract: null }, contracts: [contract], bookings: [booking], payments: [payment] })
    );
    component.load();
    expect(component.contractProgress()).toBeNull();
  });

  it("computeContractProgress (via load) tones a soon-to-expire contract as warning, and an about-to-lapse one as danger", () => {
    const warningContract = { ...contract, starts_at: new Date(Date.now() - 25 * 86_400_000).toISOString(), expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString() };
    clientsService.get.and.returnValue(of({ client: { ...client, current_contract: warningContract }, contracts: [contract], bookings: [booking], payments: [payment] }));
    component.load();
    expect(component.contractProgress()?.tone).toBe("warning");

    const dangerContract = { ...contract, starts_at: new Date(Date.now() - 29 * 86_400_000).toISOString(), expires_at: new Date(Date.now() + 1 * 86_400_000).toISOString() };
    clientsService.get.and.returnValue(of({ client: { ...client, current_contract: dangerContract }, contracts: [contract], bookings: [booking], payments: [payment] }));
    component.load();
    expect(component.contractProgress()?.tone).toBe("danger");
  });

  it("computeContractProgress falls back to epoch dates for a contract with no start/end", () => {
    clientsService.get.and.returnValue(
      of({ client: { ...client, current_contract: { ...contract, starts_at: null, expires_at: null } }, contracts: [contract], bookings: [booking], payments: [payment] })
    );
    component.load();
    expect(component.contractProgress()?.percent).toBe(100);
  });

  it("selectedPlan / contractFormTotal reflect the chosen plan, activity and discount", () => {
    expect(component.selectedPlan()).toBeNull();
    expect(component.contractFormTotal()).toBe(0);
    component.contractForm.patchValue({ contract_type_id: "ct1", item: "activity:a1", discount: 20 });
    expect(component.selectedPlan()).toEqual(contractType);
    expect(component.contractFormTotal()).toBe(80);
  });

  it("contractFormTotal clamps at 0", () => {
    component.contractForm.patchValue({ contract_type_id: "ct1", item: "activity:a1", discount: 500 });
    expect(component.contractFormTotal()).toBe(0);
  });

  it("selectedItemPrice is null until the plan and what it is sold for are chosen", () => {
    expect(component.selectedItemPrice()).toBeNull();

    component.contractForm.patchValue({ contract_type_id: "ct2" });
    expect(component.selectedItemPrice()).toBeNull();

    component.contractForm.patchValue({ item: "activity:a1" });
    expect(component.selectedItemPrice()).toBe(100);
  });

  it("picks the only thing a formule sells", () => {
    component.contractForm.patchValue({ contract_type_id: "ct1" });
    expect(component.contractForm.controls.item.value).toBe("activity:a1");
  });

  it("drops a pick the new formule does not sell", () => {
    component.contractForm.patchValue({ contract_type_id: "ct2", item: "pack:p1" });
    component.contractForm.patchValue({ contract_type_id: "ct1" });
    expect(component.contractForm.controls.item.value).toBe("activity:a1");
  });

  it("lists a formule's packs after its activities", () => {
    component.contractForm.patchValue({ contract_type_id: "ct2" });
    expect(component.saleItems().map((i) => i.key)).toEqual(["activity:a1", "pack:p1"]);
    expect(component.saleItems()[1].label).toBe("Duo (Boxe + Yoga)");
  });

  it("selectedItemPrice is null for an activity the plan has no tariff for", () => {
    component.contractForm.patchValue({ contract_type_id: "ct1", item: "activity:a-unpriced" });
    expect(component.selectedItemPrice()).toBeNull();
    expect(component.contractFormTotal()).toBe(0);
  });

  describe("contract create/edit", () => {
    it("openContractModal resets the form and opens it", () => {
      component.openContractModal();
      expect(component.contractModalOpen()).toBe(true);
    });

    it("closeContractModal closes it", () => {
      component.contractModalOpen.set(true);
      component.closeContractModal();
      expect(component.contractModalOpen()).toBe(false);
    });

    it("submitContract does nothing with an invalid form", () => {
      component.submitContract();
      expect(contractsService.create).not.toHaveBeenCalled();
    });

    it("submitContract does nothing when a plan is chosen but no activity is", () => {
      component.contractForm.patchValue({ contract_type_id: "ct2" });
      component.submitContract();
      expect(contractsService.create).not.toHaveBeenCalled();
    });

    it("submitContract creates the contract and reloads", () => {
      component.contractForm.patchValue({ contract_type_id: "ct1", item: "activity:a1" });
      contractsService.create.and.returnValue(of({ contract, payment: null }));
      component.submitContract();
      expect(contractsService.create).toHaveBeenCalledWith(jasmine.objectContaining({ contract_type_id: "ct1", activity_id: "a1" }));
      expect(component.contractModalOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("submitContract sells a pack in place of an activity", () => {
      component.contractForm.patchValue({ contract_type_id: "ct2", item: "pack:p1" });
      contractsService.create.and.returnValue(of({ contract, payment: null }));
      component.submitContract();
      const payload = contractsService.create.calls.mostRecent().args[0];
      expect(payload).toEqual(jasmine.objectContaining({ contract_type_id: "ct2", pack_id: "p1" }));
      expect(payload.activity_id).toBeUndefined();
    });

    it("submitContract shows the backend error on failure", () => {
      component.contractForm.patchValue({ contract_type_id: "ct1", item: "activity:a1" });
      contractsService.create.and.returnValue(throwError(() => new Error("nope")));
      component.submitContract();
      expect(component.formError()).toBeTruthy();
    });

    it("submitContract collects payment immediately when collect_payment is checked", () => {
      component.contractForm.patchValue({ contract_type_id: "ct1", item: "activity:a1", collect_payment: true });
      contractsService.create.and.returnValue(of({ contract, payment: null }));
      component.submitContract();
      expect(contractsService.create).toHaveBeenCalledWith(jasmine.objectContaining({ collect_payment: true, payment_method: "cash" }));
    });

    it("contractFormTotal uses the activity's full tariff when no discount is entered", () => {
      component.contractForm.patchValue({ contract_type_id: "ct1", item: "activity:a1" });
      expect(component.contractFormTotal()).toBe(100);
    });

    it("openEditModal disables the discount control for a paid contract", () => {
      component.openEditModal(contract);
      expect(component.editModalOpen()).toBe(true);
      expect(component.editForm.controls.discount.disabled).toBe(true);
    });

    it("openEditModal keeps discount enabled for an unpaid contract", () => {
      component.openEditModal({ ...contract, payment_status: "unpaid" });
      expect(component.editForm.controls.discount.disabled).toBe(false);
    });

    it("openEditModal falls back to blank dates for a contract with none", () => {
      component.openEditModal({ ...contract, starts_at: null, expires_at: null });
      expect(component.editForm.value.starts_on).toBe("");
      expect(component.editForm.value.expires_on).toBe("");
    });

    it("submitEdit omits the discount for a paid (disabled-discount) contract", () => {
      component.openEditModal(contract); // paid -> discount disabled
      contractsService.update.and.returnValue(of({ contract }));
      component.submitEdit();
      const payload = contractsService.update.calls.mostRecent().args[1] as { discount?: number };
      expect(payload.discount).toBeUndefined();
    });

    it("closeEditModal clears the editing contract", () => {
      component.openEditModal(contract);
      component.closeEditModal();
      expect(component.editModalOpen()).toBe(false);
      expect(component.editingContract()).toBeNull();
    });

    it("submitEdit does nothing without an editing contract", () => {
      component.submitEdit();
      expect(contractsService.update).not.toHaveBeenCalled();
    });

    it("submitEdit saves and reloads", () => {
      component.openEditModal({ ...contract, payment_status: "unpaid" });
      contractsService.update.and.returnValue(of({ contract }));
      component.submitEdit();
      expect(component.editModalOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("submitEdit shows the backend error on failure", () => {
      component.openEditModal({ ...contract, payment_status: "unpaid" });
      contractsService.update.and.returnValue(throwError(() => new Error("nope")));
      component.submitEdit();
      expect(component.formError()).toBeTruthy();
    });
  });

  describe("contract actions", () => {
    it("collectPayment does nothing when declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.collectPayment(contract);
      expect(paymentsService.record).not.toHaveBeenCalled();
    });

    it("collectPayment records the payment on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      paymentsService.record.and.returnValue(of({ payment }));
      await component.collectPayment(contract);
      expect(paymentsService.record).toHaveBeenCalledWith({ client_id: "cl1", payment_method: "cash", contract_id: "m1" });
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("collectPayment shows an error toast on failure", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      paymentsService.record.and.returnValue(throwError(() => new Error("nope")));
      await component.collectPayment(contract);
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("downloadReceipt fetches the receipt blob without erroring", () => {
      contractsService.receipt.and.returnValue(of(new Blob(["x"], { type: "application/pdf" })));
      expect(() => component.downloadReceipt(contract)).not.toThrow();
      expect(contractsService.receipt).toHaveBeenCalledWith("m1");
    });

    it("downloadReceipt shows an error toast on failure", () => {
      contractsService.receipt.and.returnValue(throwError(() => new Error("nope")));
      component.downloadReceipt(contract);
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("renewContract does nothing when declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.renewContract(contract);
      expect(contractsService.renew).not.toHaveBeenCalled();
    });

    it("renewContract does nothing for a term that cannot be renewed yet", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      await component.renewContract({ ...contract, renewable: false });
      expect(contractsService.renew).not.toHaveBeenCalled();
    });

    it("renewContract renews on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      contractsService.renew.and.returnValue(of({ contract }));
      await component.renewContract(contract);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("renewContract shows an error toast on failure", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      contractsService.renew.and.returnValue(throwError(() => new Error("nope")));
      await component.renewContract(contract);
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("cancelContract cancels on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      contractsService.cancel.and.returnValue(of({ contract }));
      await component.cancelContract(contract);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("cancelContract does nothing when declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.cancelContract(contract);
      expect(contractsService.cancel).not.toHaveBeenCalled();
    });

    it("cancelContract shows an error toast on failure", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      contractsService.cancel.and.returnValue(throwError(() => new Error("nope")));
      await component.cancelContract(contract);
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("deleteContract destroys on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      contractsService.destroy.and.returnValue(of(undefined));
      await component.deleteContract(contract);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("deleteContract does nothing when declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.deleteContract(contract);
      expect(contractsService.destroy).not.toHaveBeenCalled();
    });

    it("deleteContract shows an error toast on failure", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      contractsService.destroy.and.returnValue(throwError(() => new Error("nope")));
      await component.deleteContract(contract);
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("booking", () => {
    it("openBookingModal resets the form and clears sessions", () => {
      component.availableSessions.set([session]);
      component.openBookingModal();
      expect(component.bookingModalOpen()).toBe(true);
      expect(component.availableSessions()).toEqual([]);
    });

    it("closeBookingModal closes it", () => {
      component.bookingModalOpen.set(true);
      component.closeBookingModal();
      expect(component.bookingModalOpen()).toBe(false);
    });

    it("onBookingFiltersChange clears sessions without an activity/date", () => {
      component.bookingForm.patchValue({ activity_id: null, date: "" });
      component.onBookingFiltersChange();
      expect(component.availableSessions()).toEqual([]);
      expect(sessionsService.list).not.toHaveBeenCalled();
    });

    it("onBookingFiltersChange loads sessions once activity+date are set", () => {
      sessionsService.list.and.returnValue(of({ sessions: [session], meta: { page: 1, per_page: 20, total: 1, total_pages: 1 } }));
      component.bookingForm.patchValue({ activity_id: "a1", date: "2026-01-05" });
      expect(component.availableSessions()).toEqual([session]);
    });

    it("submitBooking does nothing with an invalid form", () => {
      component.submitBooking();
      expect(bookingsService.create).not.toHaveBeenCalled();
    });

    it("submitBooking creates the booking and reloads", () => {
      component.bookingForm.setValue({ activity_id: "a1", date: "2026-01-05", session_id: "s1", kind: "contract" });
      bookingsService.create.and.returnValue(of({ booking }));
      component.submitBooking();
      expect(component.bookingModalOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("submitBooking shows the backend error on failure", () => {
      component.bookingForm.setValue({ activity_id: "a1", date: "2026-01-05", session_id: "s1", kind: "contract" });
      bookingsService.create.and.returnValue(throwError(() => new Error("nope")));
      component.submitBooking();
      expect(component.formError()).toBeTruthy();
    });

    it("cancelBooking cancels on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      bookingsService.cancel.and.returnValue(of({ booking }));
      await component.cancelBooking(booking);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("cancelBooking does nothing when declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.cancelBooking(booking);
      expect(bookingsService.cancel).not.toHaveBeenCalled();
    });

    it("cancelBooking shows an error toast on failure", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      bookingsService.cancel.and.returnValue(throwError(() => new Error("nope")));
      await component.cancelBooking(booking);
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("payment", () => {
    it("openPaymentModal builds payable options from unpaid, non-zero bookings", () => {
      component.bookings.set([booking, { ...booking, id: "b2", payment_status: "paid" }, { ...booking, id: "b3", amount: 0 }]);
      component.openPaymentModal();
      expect(component.paymentModalOpen()).toBe(true);
      expect(component.paymentPayableOptions().length).toBe(1);
    });

    it("openPaymentModal offers each contract still owed — a queued renewal is a contract of its own", () => {
      component.bookings.set([]);
      component.contracts.set([{ ...contract, id: "m2", amount_due: "100" }, contract]);
      component.openPaymentModal();
      expect(component.paymentPayableOptions()).toEqual([
        jasmine.objectContaining({ kind: "contract", id: "m2", amountDue: 100 }),
      ]);
    });

    it("closePaymentModal closes it", () => {
      component.paymentModalOpen.set(true);
      component.closePaymentModal();
      expect(component.paymentModalOpen()).toBe(false);
    });

    it("submitPayment does nothing with an invalid form", () => {
      component.submitPayment();
      expect(paymentsService.record).not.toHaveBeenCalled();
    });

    it("submitPayment records a booking payment and reloads", () => {
      component.paymentForm.setValue({ payable_key: "booking:b1", notes: "" });
      paymentsService.record.and.returnValue(of({ payment }));
      component.submitPayment();
      expect(paymentsService.record).toHaveBeenCalledWith({
        client_id: "cl1", payment_method: "cash", notes: undefined, contract_id: undefined, booking_id: "b1",
      });
      expect(component.paymentModalOpen()).toBe(false);
    });

    it("submitPayment shows the backend error on failure", () => {
      component.paymentForm.setValue({ payable_key: "booking:b1", notes: "" });
      paymentsService.record.and.returnValue(throwError(() => new Error("nope")));
      component.submitPayment();
      expect(component.formError()).toBeTruthy();
    });

    it("submitPayment records a contract payment with the entered notes", () => {
      component.paymentForm.setValue({ payable_key: "contract:p1", notes: "cash tip" });
      paymentsService.record.and.returnValue(of({ payment }));
      component.submitPayment();
      expect(paymentsService.record).toHaveBeenCalledWith({
        client_id: "cl1", payment_method: "cash", notes: "cash tip", contract_id: "p1", booking_id: undefined,
      });
    });
  });

  describe("check-in", () => {
    it("shows an info toast when there is no session today", () => {
      component.bookings.set([]);
      component.checkIn();
      expect(toast.toasts()[0].kind).toBe("info");
      expect(attendanceService.mark).not.toHaveBeenCalled();
    });

    it("marks today's confirmed booking present", () => {
      component.bookings.set([booking]);
      attendanceService.mark.and.returnValue(of({ attendance: booking as never }));
      component.checkIn();
      expect(attendanceService.mark).toHaveBeenCalledWith("b1", "present");
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("shows an error toast when marking fails", () => {
      component.bookings.set([booking]);
      attendanceService.mark.and.returnValue(throwError(() => new Error("nope")));
      component.checkIn();
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("the member's own app", () => {
    it("invites them by email rather than setting a password", async () => {
      component.client.set({ ...client, email: "amy@example.com" });
      spyOn(confirmService, "ask").and.resolveTo(true);
      clientsService.invite.and.returnValue(of({ client: { ...client, invitation_pending: true } }));

      await component.inviteToApp();

      expect(clientsService.invite).toHaveBeenCalledWith("cl1");
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("does not invite someone with no email", async () => {
      component.client.set({ ...client, email: null });
      await component.inviteToApp();
      expect(clientsService.invite).not.toHaveBeenCalled();
    });

    // The member app comes with Pro: on Starter the menu says so instead of
    // offering a button the backend would refuse.
    it("offers the invitation only when the plan includes the member app", () => {
      component.client.set({ ...client, email: "amy@example.com" });
      fixture.detectChanges();
      (fixture.nativeElement.querySelector("app-action-menu button") as HTMLButtonElement).click();
      fixture.detectChanges();

      const item = () =>
        Array.from(fixture.nativeElement.querySelectorAll(".fx-menu-item") as NodeListOf<HTMLButtonElement>).find((b) =>
          b.querySelector(".bi-phone")
        )!;
      expect(item().textContent).toContain("clients.invite_to_app");
      expect(item().disabled).toBeFalse();

      memberApp.set(false);
      fixture.detectChanges();

      expect(item().textContent).toContain("clients.invite_needs_pro");
      expect(item().disabled).toBeTrue();
    });

    it("shows why an invitation was refused", async () => {
      component.client.set({ ...client, email: "amy@example.com" });
      spyOn(confirmService, "ask").and.resolveTo(true);
      clientsService.invite.and.returnValue(throwError(() => new Error("nope")));

      await component.inviteToApp();

      expect(toast.toasts()[0].kind).toBe("error");
      expect(component.inviting()).toBe(false);
    });
  });

  describe("removing a member", () => {
    it("removes them after a confirmation and goes back to the list", async () => {
      const router = TestBed.inject(Router);
      spyOn(router, "navigateByUrl");
      spyOn(confirmService, "ask").and.resolveTo(true);
      clientsService.remove.and.returnValue(of(undefined));

      await component.removeMember();

      expect(clientsService.remove).toHaveBeenCalledWith("cl1");
      expect(router.navigateByUrl).toHaveBeenCalledWith("/admin/clients");
    });

    it("does nothing when the confirmation is declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.removeMember();
      expect(clientsService.remove).not.toHaveBeenCalled();
    });

    it("keeps them and says why when the API refuses (a running subscription)", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      clientsService.remove.and.returnValue(throwError(() => new Error("still subscribed")));

      await component.removeMember();

      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("the health file", () => {
    it("saves contraindications and the waiver date on this gym's copy", () => {
      clientsService.update.and.returnValue(of({ client }));
      component.openHealthModal();
      component.healthForm.setValue({ health_notes: "  Pacemaker  ", waiver_signed_on: "2026-10-01" });

      component.submitHealth();

      expect(clientsService.update).toHaveBeenCalledWith("cl1", { health_notes: "Pacemaker", waiver_signed_on: "2026-10-01" });
      expect(component.healthModalOpen()).toBe(false);
    });

    it("clears both fields with nulls rather than empty strings", () => {
      clientsService.update.and.returnValue(of({ client }));
      component.healthForm.setValue({ health_notes: " ", waiver_signed_on: "" });

      component.submitHealth();

      expect(clientsService.update).toHaveBeenCalledWith("cl1", { health_notes: null, waiver_signed_on: null });
    });

    it("flags a missing declaration on the profile", () => {
      expect(fixture.nativeElement.querySelector(".prof-health-waiver.is-missing")).toBeTruthy();
    });
  });

  describe("booking someone with no contract", () => {
    it("starts from the trial when the member has nothing to book against", () => {
      component.client.set({ ...client, current_contract: null });
      component.openBookingModal();
      expect(component.bookingForm.controls.kind.value).toBe("trial");
    });

    it("starts from the contract when one covers them", () => {
      component.openBookingModal();
      expect(component.bookingForm.controls.kind.value).toBe("contract");
    });

    it("never offers a trial when the gym turned drop-ins off", () => {
      features.set({ drop_in: false });
      component.client.set({ ...client, current_contract: null });
      component.openBookingModal();
      expect(component.bookingForm.controls.kind.value).toBe("contract");
    });

    it("sends the kind with the booking", () => {
      component.bookingForm.setValue({ activity_id: "a1", date: "2026-01-05", session_id: "s1", kind: "drop_in" });
      bookingsService.create.and.returnValue(of({ booking }));

      component.submitBooking();

      expect(bookingsService.create).toHaveBeenCalledWith("cl1", "s1", "drop_in");
    });
  });

  describe("pausing a membership", () => {
    it("pauses after a confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      contractsService.pause.and.returnValue(of({ contract: { ...contract, paused: true } }));

      await component.togglePause(contract);

      expect(contractsService.pause).toHaveBeenCalledWith("m1");
    });

    it("resumes without asking", async () => {
      const ask = spyOn(confirmService, "ask");
      contractsService.resume.and.returnValue(of({ contract }));

      await component.togglePause({ ...contract, paused: true });

      expect(ask).not.toHaveBeenCalled();
      expect(contractsService.resume).toHaveBeenCalledWith("m1");
    });
  });
});
