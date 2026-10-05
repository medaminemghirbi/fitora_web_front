import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Client, ClientDetail } from "../../../core/models/client.model";
import { Payment } from "../../../core/models/payment.model";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ClientsService } from "../../../core/services/clients.service";
import { PaymentsService } from "../../../core/services/payments.service";
import { ToastService } from "../../../core/services/toast.service";
import { AdminPaymentsComponent } from "./payments.component";

describe("AdminPaymentsComponent", () => {
  let fixture: ComponentFixture<AdminPaymentsComponent>;
  let component: AdminPaymentsComponent;
  let paymentsService: jasmine.SpyObj<PaymentsService>;
  let clientsService: jasmine.SpyObj<ClientsService>;
  let confirmService: ConfirmService;
  let toast: ToastService;

  const meta = { page: 1, per_page: 20, total: 1, total_pages: 1 };
  const payment: Payment = {
    id: "pay1",
    amount: 100,
    currency: "TND",
    payment_method: "cash",
    status: "paid",
    notes: null,
    paid_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    client: { id: "cl1", full_name: "Amy Client", phone: null },
    company: { id: "co1", name: "Acme Gym" },
    created_by: null,
    product_name: null,
  };
  const client: Client = {
    id: "cl1",
    first_name: "Amy",
    last_name: "Client",
    full_name: "Amy Client",
    email: null,
    phone: null,
    active: true,
    login_enabled: false,
    joined_at: "2026-01-01",
    last_visit_at: null,
    current_contract: null,
  };
  const clientDetail: ClientDetail = {
    ...client,
    date_of_birth: null,
    gender: null,
    address: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    notes: null,
    health_notes: null,
    waiver_signed_on: null,
    outstanding_balance: "50",
    attendance_rate: null,
    last_visit_at: null,
    identity_locked: false,
    invitation_pending: false,
    invited_at: null,
  };

  function build(queryParams: Record<string, string> = {}): void {
    TestBed.resetTestingModule();
    paymentsService = jasmine.createSpyObj<PaymentsService>("PaymentsService", ["list", "refund", "record"]);
    clientsService = jasmine.createSpyObj<ClientsService>("ClientsService", ["list", "get"]);
    paymentsService.list.and.returnValue(of({ payments: [payment], meta , counts: {}, method_counts: {}, totals: { collected_this_month: 0, collected_total: 0, refunded_value: 0, cancelled_value: 0, average_payment: 0 } }));

    TestBed.configureTestingModule({
      imports: [AdminPaymentsComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PaymentsService, useValue: paymentsService },
        { provide: ClientsService, useValue: clientsService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });

    fixture = TestBed.createComponent(AdminPaymentsComponent);
    component = fixture.componentInstance;
    confirmService = TestBed.inject(ConfirmService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it("loads payments on init", () => {
    expect(component.payments().length).toBe(1);
  });

  it("sets the error flag when loading fails", () => {
    paymentsService.list.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  it("opens the record modal automatically when ?action=new is in the URL", () => {
    build({ action: "new" });
    expect(component.recordModalOpen()).toBe(true);
  });

  it("applyFilters resets to page 1", () => {
    component.page.set(3);
    component.applyFilters();
    expect(component.page()).toBe(1);
  });

  it("applyStatusFilter sets the status and reloads from page 1", () => {
    component.page.set(3);
    component.applyStatusFilter("paid");
    expect(component.statusFilter()).toBe("paid");
    expect(component.page()).toBe(1);
    expect(paymentsService.list).toHaveBeenCalledWith(jasmine.objectContaining({ status: "paid" }));
  });

  it("hasFilters / resetFilters", () => {
    component.onSearchChange("amy");
    component.applyStatusFilter("paid");
    expect(component.hasFilters()).toBe(true);
    component.resetFilters();
    expect(component.hasFilters()).toBe(false);
    expect(component.search()).toBe("");
    expect(component.statusFilter()).toBe("");
  });

  it("filterChips is empty with no active filters", () => {
    expect(component.filterChips()).toEqual([]);
  });

  it("filterChips reflects search and status filters, each clearing independently", fakeAsync(() => {
    component.onSearchChange("amy");
    tick(1000);
    component.applyStatusFilter("paid");
    const chips = component.filterChips();
    expect(chips.length).toBe(2);
    expect(chips[0].label).toContain("amy");

    chips[1].clear();
    expect(component.statusFilter()).toBe("");
    expect(component.search()).toBe("amy");
  }));

  it("onSearchChange debounces the search", fakeAsync(() => {
    component.onSearchChange("amy");
    tick(1000);
    expect(paymentsService.list).toHaveBeenCalledWith({ status: undefined, payment_method: undefined, q: "amy", page: 1 });
  }));

  it("onSearchChange cancels a pending debounce timer on rapid typing", fakeAsync(() => {
    component.onSearchChange("a");
    component.onSearchChange("am");
    tick(1000);
    expect(paymentsService.list).toHaveBeenCalledWith(jasmine.objectContaining({ q: "am" }));
  }));

  it("onPageChange loads the requested page", () => {
    component.onPageChange(2);
    expect(component.page()).toBe(2);
  });

  it("refund() does nothing when declined", async () => {
    spyOn(confirmService, "ask").and.resolveTo(false);
    await component.refund(payment);
    expect(paymentsService.refund).not.toHaveBeenCalled();
  });

  it("refund() refunds and reloads on confirmation", async () => {
    spyOn(confirmService, "ask").and.resolveTo(true);
    paymentsService.refund.and.returnValue(of({ payment }));
    await component.refund(payment);
    expect(paymentsService.refund).toHaveBeenCalledWith("pay1");
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("refund() shows an error toast on failure", async () => {
    spyOn(confirmService, "ask").and.resolveTo(true);
    paymentsService.refund.and.returnValue(throwError(() => new Error("nope")));
    await component.refund(payment);
    expect(toast.toasts()[0].kind).toBe("error");
  });

  it("openRecordModal resets the form and opens it", () => {
    component.recordForm.patchValue({ amount: 99 });
    component.openRecordModal();
    expect(component.recordModalOpen()).toBe(true);
    expect(component.recordForm.value.amount).toBe(0);
  });

  it("closeRecordModal closes it", () => {
    component.recordModalOpen.set(true);
    component.closeRecordModal();
    expect(component.recordModalOpen()).toBe(false);
  });

  it("searchClients clears results for a short term without calling the API", () => {
    component.searchClients("a");
    expect(component.clientResults()).toEqual([]);
    expect(clientsService.list).not.toHaveBeenCalled();
  });

  it("searchClients queries for a 2+ char term", () => {
    clientsService.list.and.returnValue(of({ clients: [client], meta, counts: {} }));
    component.searchClients("amy");
    expect(component.clientResults()).toEqual([client]);
  });

  it("selectClient loads the client detail and builds payable options from unpaid contracts/bookings", () => {
    clientsService.get.and.returnValue(
      of({
        client: clientDetail,
        contracts: [
          { id: "m1", payment_status: "unpaid", amount_due: 80, plan: { name: "Basic" }, final_price: "80" } as never,
          { id: "m2", payment_status: "paid", amount_due: 0, plan: { name: "Basic" }, final_price: "80" } as never,
        ],
        bookings: [
          { id: "b1", payment_status: "unpaid", amount: 20, session: { activity_name: "Yoga" } } as never,
          { id: "b2", payment_status: "unpaid", amount: 0, session: { activity_name: "Yoga" } } as never,
        ],
        payments: [],
      })
    );

    component.selectClient(client);

    expect(component.selectedClient()).toEqual(clientDetail);
    expect(component.clientSearch()).toBe("Amy Client");
    expect(component.payableOptions().length).toBe(2); // 1 unpaid contract + 1 unpaid, non-zero booking
    expect(component.payableOptions()[0].kind).toBe("contract");
    expect(component.payableOptions()[1].kind).toBe("booking");
  });

  it("onPayableChange fills in the amount from the selected payable", () => {
    component.payableOptions.set([{ kind: "contract", id: "p1", label: "x", amountDue: 42 }]);
    component.onPayableChange("contract:p1");
    expect(component.recordForm.value.amount).toBe(42);
  });

  it("submitRecord does nothing without a selected client", () => {
    component.recordForm.patchValue({ payable_key: "contract:p1", amount: 10 });
    component.submitRecord();
    expect(paymentsService.record).not.toHaveBeenCalled();
  });

  it("submitRecord does nothing with an invalid form", () => {
    component.selectedClient.set(clientDetail);
    component.recordForm.patchValue({ payable_key: "", amount: 0 });
    component.submitRecord();
    expect(paymentsService.record).not.toHaveBeenCalled();
    expect(component.recordForm.touched).toBe(true);
  });

  it("submitRecord records a contract payment and closes the modal", () => {
    component.selectedClient.set(clientDetail);
    component.recordForm.setValue({ payable_key: "contract:p1", amount: 42, notes: "" });
    paymentsService.record.and.returnValue(of({ payment }));

    component.submitRecord();

    expect(paymentsService.record).toHaveBeenCalledWith({
      client_id: "cl1",
      amount: 42,
      payment_method: "cash",
      notes: undefined,
      contract_id: "p1",
      booking_id: undefined,
    });
    expect(component.recordModalOpen()).toBe(false);
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("submitRecord records a booking payment", () => {
    component.selectedClient.set(clientDetail);
    component.recordForm.setValue({ payable_key: "booking:b1", amount: 20, notes: "cash tip" });
    paymentsService.record.and.returnValue(of({ payment }));

    component.submitRecord();

    expect(paymentsService.record).toHaveBeenCalledWith({
      client_id: "cl1",
      amount: 20,
      payment_method: "cash",
      notes: "cash tip",
      contract_id: undefined,
      booking_id: "b1",
    });
  });

  it("submitRecord shows the backend error on failure", () => {
    component.selectedClient.set(clientDetail);
    component.recordForm.setValue({ payable_key: "contract:p1", amount: 42, notes: "" });
    paymentsService.record.and.returnValue(throwError(() => new Error("nope")));

    component.submitRecord();

    expect(component.saving()).toBe(false);
    expect(component.formError()).toBeTruthy();
  });

  it("never offers card: Fitora takes no payment online and the API refuses it", () => {
    expect(component.methodOptions.map((o) => o.value)).toEqual(["cash", "bank_transfer", "other"]);
  });
});
