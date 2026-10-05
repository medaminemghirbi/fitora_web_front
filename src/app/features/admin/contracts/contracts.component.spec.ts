import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Contract } from "../../../core/models/contract.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { ContractsService } from "../../../core/services/contracts.service";
import { PaymentsService } from "../../../core/services/payments.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ContractsComponent } from "./contracts.component";

describe("ContractsComponent", () => {
  let fixture: ComponentFixture<ContractsComponent>;
  let component: ContractsComponent;
  let contractsService: jasmine.SpyObj<ContractsService>;
  let contractTypesService: jasmine.SpyObj<ContractTypesService>;

  const meta = { page: 1, per_page: 20, total: 1, total_pages: 1 };
  const contractType: ContractType = {
    id: "ct1",
    company_id: "1",
    name: "Basic",
    description: null,
    currency: "TND",
    billing_period: "monthly",
    duration_days: 30,
    validity_days: null,
    session_count: null,
    unlimited_bookings: true,
    booking_limit: null,
    priority_booking: false,
    color: "#000",
    active: true,
    activity_ids: [],
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 100 }],
    pack_prices: [],
  };
  const contract: Contract = {
    id: "m1",
    invoice_ref: "FAC-2026-0001",
    status: "active",
    paused: false,
    paused_at: null,
    starts_at: "2026-01-01",
    expires_at: "2026-02-01",
    remaining_bookings: null,
    auto_renew: true,
    discount: "0",
    base_price: "100.00",
    final_price: "100",
    payment_status: "paid",
    amount_due: "0",
    plan: contractType,
    activity: { id: "a1", name: "Yoga", emoji: "\u{1F9D8}" },
    all_access: false, renewed_from_id: null, renewal: null, renewable: true,
    activity_label: "Yoga",
    client: { id: "cl1", full_name: "Amy Client", phone: null },
  };

  beforeEach(async () => {
    contractsService = jasmine.createSpyObj<ContractsService>("ContractsService", ["list"]);
    contractTypesService = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list"]);
    contractsService.list.and.returnValue(of({ contracts: [contract], meta , counts: {}, plan_counts: {}, totals: { portfolio_value: 0, average_basket: 0, unpaid_value: 0, expiring_soon: 0 } }));
    contractTypesService.list.and.returnValue(of({ plans: [contractType] }));

    await TestBed.configureTestingModule({
      imports: [ContractsComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClientTesting(),
        provideHttpClient(),
        provideRouter([]),
        { provide: ContractsService, useValue: contractsService },
        { provide: ContractTypesService, useValue: contractTypesService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ContractsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("loads contracts and the plan filter list on init", () => {
    expect(component.contracts().length).toBe(1);
    expect(component.plans().length).toBe(1);
  });

  it("sets the error flag when loading fails", () => {
    contractsService.list.and.returnValue(throwError(() => new Error("nope")));
    component.loadContracts();
    expect(component.error()).toBe(true);
  });

  it("onSearchChange debounces, resets to page 1", fakeAsync(() => {
    component.page.set(3);
    component.onSearchChange("amy");
    tick(1000);
    expect(component.page()).toBe(1);
    expect(contractsService.list).toHaveBeenCalledWith({ status: undefined, payment: undefined, contract_type_id: undefined, q: "amy", page: 1 });
  }));

  it("onSearchChange cancels a pending debounce timer on rapid typing", fakeAsync(() => {
    component.onSearchChange("a");
    component.onSearchChange("am");
    tick(1000);
    expect(contractsService.list).toHaveBeenCalledWith(jasmine.objectContaining({ q: "am" }));
  }));

  it("applyContractFilter sets the status filter and reloads from page 1", () => {
    component.page.set(2);
    component.applyContractFilter("expired");
    expect(component.contractStatusFilter()).toBe("expired");
    expect(component.page()).toBe(1);
  });

  it("applyContractTypeFilter sets the plan filter and reloads from page 1", () => {
    component.applyContractTypeFilter("ct1");
    expect(component.contractTypeFilter()).toBe("ct1");
    expect(contractsService.list).toHaveBeenCalledWith({ status: undefined, payment: undefined, contract_type_id: "ct1", q: undefined, page: 1 });
  });

  it("onPageChange loads the requested page", () => {
    component.onPageChange(2);
    expect(component.page()).toBe(2);
  });

  it("hasFilters/resetFilters", () => {
    component.applyContractFilter("active");
    expect(component.hasFilters()).toBe(true);
    component.resetFilters();
    expect(component.hasFilters()).toBe(false);
  });

  it("lists the rail in the order a desk reads it: what is fine, what is running out, what has run out", () => {
    expect(component.statusOptions.map((o) => o.value)).toEqual([
      "",
      "active",
      "expiring",
      "expired",
      "pending",
      "paused",
      "cancelled",
    ]);
  });

  it("filterChips is empty with no active filters", () => {
    expect(component.filterChips()).toEqual([]);
  });

  it("filterChips reflects search, status, and plan filters", () => {
    component.onSearchChange("amy");
    component.applyContractFilter("active");
    component.applyContractTypeFilter("ct1");
    const chips = component.filterChips();
    expect(chips.length).toBe(3);
    expect(chips[0].label).toContain("amy");
    expect(chips[2].label).toBe("Basic");
  });

  it("a filter chip's clear() removes only that filter", fakeAsync(() => {
    component.onSearchChange("amy");
    component.applyContractFilter("active");
    tick(1000);
    const chips = component.filterChips();
    chips[1].clear();
    expect(component.contractStatusFilter()).toBe("");
    expect(component.search()).toBe("amy");
  }));

  it("omits a status/plan chip once its filter list hasn't loaded a matching option", () => {
    component.plans.set([]);
    component.applyContractTypeFilter("unknown");
    expect(component.filterChips()).toEqual([]);
  });
});

// "Aujourd'hui" links here already filtered; the page has to arrive holding
// that filter, not merely accept it once someone clicks the rail.
describe("ContractsComponent — arriving from the dashboard", () => {
  function buildWith(query: Record<string, string>): ContractsComponent {
    TestBed.resetTestingModule();
    const contractsService = jasmine.createSpyObj<ContractsService>("ContractsService", ["list"]);
    contractsService.list.and.returnValue(
      of({ contracts: [], meta: { page: 1, per_page: 20, total: 0, total_pages: 0 }, counts: {}, plan_counts: {}, totals: { portfolio_value: 0, average_basket: 0, unpaid_value: 0, expiring_soon: 0 } })
    );
    const contractTypesService = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list"]);
    contractTypesService.list.and.returnValue(of({ plans: [] }));

    TestBed.configureTestingModule({
      imports: [ContractsComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClientTesting(),
        provideHttpClient(),
        provideRouter([]),
        { provide: ContractsService, useValue: contractsService },
        { provide: ContractTypesService, useValue: contractTypesService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });

    const fixture = TestBed.createComponent(ContractsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it("opens already filtered to what runs out this month", () => {
    const component = buildWith({ status: "expiring" });
    expect(component.contractStatusFilter()).toBe("expiring");
  });

  it("opens already filtered to what nobody has paid for", () => {
    const component = buildWith({ payment: "unpaid" });
    expect(component.paymentFilter()).toBe("unpaid");
    expect(component.filterChips().length).toBe(1);
  });

  it("ignores a payment value it does not recognise", () => {
    const component = buildWith({ payment: "later" });
    expect(component.paymentFilter()).toBe("");
  });
});

describe("ContractsComponent — the renew button", () => {
  function rowWith(overrides: Partial<Contract>): HTMLElement {
    TestBed.resetTestingModule();
    const contract = {
      id: "m1", invoice_ref: "FAC-2026-0001", status: "active", paused: false, payment_status: "paid", amount_due: "0", discount: "0.0",
      final_price: "100", base_price: "100", starts_at: "2026-01-01", expires_at: "2026-02-01",
      renewed_from_id: null, renewal: null, renewable: false, activity: null, activity_label: "Yoga",
      plan: { id: "ct1", name: "Mensuel", currency: "TND", color: "#000" },
      client: { id: "cl1", full_name: "Amy Client", phone: null },
      ...overrides,
    } as never as Contract;
    const contractsService = jasmine.createSpyObj<ContractsService>("ContractsService", ["list"]);
    contractsService.list.and.returnValue(
      of({ contracts: [contract], meta: { page: 1, per_page: 20, total: 1, total_pages: 1 }, counts: {}, plan_counts: {}, totals: { portfolio_value: 0, average_basket: 0, unpaid_value: 0, expiring_soon: 0 } })
    );
    const contractTypesService = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list"]);
    contractTypesService.list.and.returnValue(of({ plans: [] }));
    TestBed.configureTestingModule({
      imports: [ContractsComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClientTesting(),
        provideHttpClient(),
        provideRouter([]),
        { provide: ContractsService, useValue: contractsService },
        { provide: ContractTypesService, useValue: contractTypesService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });
    const fixture = TestBed.createComponent(ContractsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const renewButtons = (el: HTMLElement) =>
    Array.from(el.querySelectorAll(".fx-row-actions button")).filter((b) => b.textContent?.includes("contracts.renew"));

  it("is offered on a term the backend says can be renewed", () => {
    expect(renewButtons(rowWith({ renewable: true })).length).toBe(1);
  });

  it("is not offered on a term ending later, or already renewed", () => {
    expect(renewButtons(rowWith({ renewable: false })).length).toBe(0);
  });

  it("shows no discount line for a discount of zero", () => {
    expect(rowWith({ discount: "0.0" }).querySelector("td .fx-cell-sub.text-warning-token")).toBeNull();
    expect(rowWith({ discount: "20.0" }).querySelector("td .fx-cell-sub.text-warning-token")).not.toBeNull();
  });
});

// The dashboard sends people to this list to renew and to collect. Doing
// either from the row is the whole point of the link.
describe("ContractsComponent — acting on the row", () => {
  let component: ContractsComponent;
  let contractsService: jasmine.SpyObj<ContractsService>;
  let paymentsService: jasmine.SpyObj<PaymentsService>;
  let confirmService: ConfirmService;

  const plan = {
    id: "ct1", name: "Mensuel", currency: "TND", billing_period: "monthly",
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: null, price: 100 }],
    pack_prices: [],
  } as never as ContractType;
  const yearly = {
    id: "ct2", name: "Annuel", currency: "TND", billing_period: "yearly",
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: null, price: 900 }],
    pack_prices: [],
  } as never as ContractType;
  const unpriced = { id: "ct3", name: "Vide", currency: "TND", activity_prices: [], pack_prices: [] } as never as ContractType;

  const contract = {
    id: "m1",
    status: "active",
    payment_status: "unpaid",
    amount_due: "100",
    renewed_from_id: null,
    renewal: null,
    renewable: true,
    plan,
    activity: { id: "a1", name: "Yoga", emoji: null },
    pack: null,
    all_access: false,
    client: { id: "cl1", full_name: "Amy Client", phone: null },
  } as never as Contract;

  beforeEach(() => {
    TestBed.resetTestingModule();
    contractsService = jasmine.createSpyObj<ContractsService>("ContractsService", ["list", "renew", "pause", "resume"]);
    contractsService.list.and.returnValue(
      of({ contracts: [], meta: { page: 1, per_page: 20, total: 0, total_pages: 0 }, counts: {}, plan_counts: {}, totals: { portfolio_value: 0, average_basket: 0, unpaid_value: 0, expiring_soon: 0 } })
    );
    contractsService.renew.and.returnValue(of({ contract }));
    paymentsService = jasmine.createSpyObj<PaymentsService>("PaymentsService", ["record"]);
    paymentsService.record.and.returnValue(of({ payment: {} as never }));
    const contractTypesService = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list"]);
    contractTypesService.list.and.returnValue(of({ plans: [plan, yearly, unpriced] }));

    TestBed.configureTestingModule({
      imports: [ContractsComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClientTesting(),
        provideHttpClient(),
        provideRouter([]),
        { provide: ContractsService, useValue: contractsService },
        { provide: ContractTypesService, useValue: contractTypesService },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });

    const fixture = TestBed.createComponent(ContractsComponent);
    component = fixture.componentInstance;
    confirmService = TestBed.inject(ConfirmService);
    fixture.detectChanges();
  });

  it("settles the contract in full and in cash, sending no amount of its own", async () => {
    await component.collect(contract);

    expect(paymentsService.record).toHaveBeenCalledWith({
      client_id: "cl1",
      payment_method: "cash",
      contract_id: "m1",
    });
    expect(component.rowBusy()).toBeNull();
  });

  it("tells a renewal waiting its turn from the term in force", () => {
    const later = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const earlier = new Date(Date.now() - 10 * 86_400_000).toISOString();

    expect(component.isQueuedRenewal({ ...contract, renewed_from_id: "m0", starts_at: later } as Contract)).toBeTrue();
    expect(component.isQueuedRenewal({ ...contract, renewed_from_id: "m0", starts_at: earlier } as Contract)).toBeFalse();
    expect(component.isQueuedRenewal({ ...contract, starts_at: later } as Contract)).toBeFalse();
  });

  it("opens the renewal on the formule the member is on, and renews it as it is", () => {
    component.renew(contract);

    expect(component.renewing()).toBe(contract);
    expect(component.renewPlanId()).toBe("ct1");
    expect(component.renewItem()).toBe("activity:a1");
    expect(component.renewSameFormule()).toBeTrue();

    component.confirmRenew();

    expect(contractsService.renew).toHaveBeenCalledWith("m1", {});
    expect(component.renewing()).toBeNull();
    expect(component.rowBusy()).toBeNull();
  });

  it("renews onto another formule, keeping the activity it also sells", () => {
    component.renew(contract);
    component.onRenewPlanChange("ct2");

    expect(component.renewItem()).toBe("activity:a1");
    expect(component.renewPrice()).toBe(900);

    component.confirmRenew();

    expect(contractsService.renew).toHaveBeenCalledWith("m1", { contract_type_id: "ct2", activity_id: "a1" });
  });

  it("will not renew onto a formule with no price for it", () => {
    component.renew(contract);
    component.onRenewPlanChange("ct3");

    expect(component.renewBlocked()).toBeTrue();
    component.confirmRenew();
    expect(contractsService.renew).not.toHaveBeenCalled();
  });

  it("closes the renewal without renewing", () => {
    component.renew(contract);
    component.closeRenew();

    expect(component.renewing()).toBeNull();
    expect(contractsService.renew).not.toHaveBeenCalled();
  });

  it("asks before pausing, then pauses", async () => {
    contractsService.pause.and.returnValue(of({ contract }));
    const pending = component.togglePause({ ...contract, paused: false } as Contract);
    confirmService.resolve(true);
    await pending;

    expect(contractsService.pause).toHaveBeenCalledWith("m1");
    expect(component.rowBusy()).toBeNull();
  });

  it("resumes straight away — giving days back needs no second thought", async () => {
    contractsService.resume.and.returnValue(of({ contract }));

    await component.togglePause({ ...contract, paused: true } as Contract);

    expect(contractsService.resume).toHaveBeenCalledWith("m1");
  });

  it("downloads the signed contract and the invoice, named after the reference", () => {
    contractsService.agreement = jasmine.createSpy().and.returnValue(of(new Blob()));
    contractsService.receipt = jasmine.createSpy().and.returnValue(of(new Blob()));
    const click = spyOn(HTMLAnchorElement.prototype, "click");
    const ref = { ...contract, invoice_ref: "FAC-2026-0042" } as Contract;

    component.downloadAgreement(ref);
    component.downloadInvoice(ref);

    expect(contractsService.agreement).toHaveBeenCalledWith("m1");
    expect(contractsService.receipt).toHaveBeenCalledWith("m1");
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("refuses a second action while one is in flight", async () => {
    component.rowBusy.set("m1");
    await component.collect(contract);
    expect(paymentsService.record).not.toHaveBeenCalled();
  });
});

