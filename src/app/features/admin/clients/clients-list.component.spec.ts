import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Client } from "../../../core/models/client.model";
import { ClientsService } from "../../../core/services/clients.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ToastService } from "../../../core/services/toast.service";
import { ClientsListComponent } from "./clients-list.component";

describe("ClientsListComponent", () => {
  let fixture: ComponentFixture<ClientsListComponent>;
  let component: ClientsListComponent;
  let service: jasmine.SpyObj<ClientsService>;
  let router: Router;
  let toast: ToastService;

  const meta = { page: 1, per_page: 20, total: 1, total_pages: 1 };
  const client: Client = {
    id: "cl1",
    first_name: "Amy",
    last_name: "Client",
    full_name: "Amy Client",
    email: null,
    phone: "12345678",
    active: true,
    login_enabled: false,
    joined_at: "2026-01-01",
    last_visit_at: null,
    current_contract: null,
  };

  function build(queryParams: Record<string, string> = {}): void {
    TestBed.resetTestingModule();
    service = jasmine.createSpyObj<ClientsService>("ClientsService", ["list", "create"]);
    service.list.and.returnValue(of({ clients: [client], meta, counts: {} }));

    TestBed.configureTestingModule({
      imports: [ClientsListComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ClientsService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });

    fixture = TestBed.createComponent(ClientsListComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, "navigate");
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it("loads clients on init", () => {
    expect(component.clients().length).toBe(1);
  });

  it("sets the error flag when loading fails", () => {
    service.list.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  it("opens the create modal automatically for ?action=new", () => {
    build({ action: "new" });
    expect(component.createModalOpen()).toBe(true);
  });

  it("hasFilters / clearFilters", () => {
    component.search.set("amy");
    expect(component.hasFilters()).toBe(true);
    component.clearFilters();
    expect(component.hasFilters()).toBe(false);
    expect(component.page()).toBe(1);
  });

  it("filterChips is empty with no active filters", () => {
    expect(component.filterChips()).toEqual([]);
  });

  it("filterChips reflects an active search term and status filter", () => {
    component.search.set("amy");
    component.statusFilter.set("active");
    const chips = component.filterChips();
    expect(chips.length).toBe(2);
    expect(chips[0].label).toContain("amy");
  });

  it("a filter chip's clear() removes just that filter", fakeAsync(() => {
    component.search.set("amy");
    component.statusFilter.set("active");
    const chips = component.filterChips();
    chips[0].clear();
    tick(1000);
    expect(component.search()).toBe("");
    expect(component.statusFilter()).toBe("active");
  }));

  it("the status filter chip's clear() removes just the status filter", () => {
    component.search.set("amy");
    component.statusFilter.set("active");
    const chips = component.filterChips();
    chips[1].clear();
    expect(component.statusFilter()).toBe("");
    expect(component.search()).toBe("amy");
  });

  it("onSearchChange debounces the search", fakeAsync(() => {
    component.page.set(3);
    component.onSearchChange("amy");
    tick(1000);
    expect(component.page()).toBe(1);
    expect(service.list).toHaveBeenCalledWith(jasmine.objectContaining({ search: "amy", status: undefined, page: 1 }));
  }));

  it("onSearchChange cancels a pending debounce timer on rapid typing", fakeAsync(() => {
    component.onSearchChange("a");
    component.onSearchChange("am");
    tick(1000);
    expect(service.list).toHaveBeenCalledWith(jasmine.objectContaining({ search: "am" }));
  }));

  it("applyStatusFilter reloads from page 1", () => {
    component.applyStatusFilter("inactive");
    expect(component.statusFilter()).toBe("inactive");
    expect(component.page()).toBe(1);
  });

  it("counts only the folded-away filters on the toggle's badge", () => {
    component.statusFilter.set("active");
    expect(component.advancedCount()).toBe(0);

    component.setPlanFilter("p1");
    component.setGenderFilter("female");
    expect(component.advancedCount()).toBe(2);
    expect(component.hasFilters()).toBe(true);
  });

  it("sends every advanced filter with the list request, from page 1", () => {
    component.page.set(4);
    component.setActivityFilter("a1");
    component.setJoinedFrom("2026-01-01");

    expect(component.page()).toBe(1);
    expect(service.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ activity_id: "a1", joined_from: "2026-01-01", page: 1 })
    );
  });

  it("clearFilters drops the advanced filters too", () => {
    component.setPlanFilter("p1");
    component.setJoinedTo("2026-03-01");
    component.clearFilters();

    expect(component.advancedCount()).toBe(0);
    expect(component.hasFilters()).toBe(false);
  });

  it("gives the joined range one chip, whichever of its ends is set", () => {
    component.setJoinedFrom("2026-01-01");
    const chips = component.filterChips();
    expect(chips.length).toBe(1);

    chips[0].clear();
    expect(component.joinedFrom()).toBe("");
    expect(component.joinedTo()).toBe("");
  });

  it("sorts by a column, and flips the direction when it is already the one sorted", () => {
    component.sortBy("joined");
    expect(component.sort()).toBe("joined");
    expect(component.direction()).toBe("asc");
    expect(component.ariaSort("joined")).toBe("ascending");
    expect(component.ariaSort("name")).toBe("none");

    component.sortBy("joined");
    expect(component.direction()).toBe("desc");

    // A different column starts over rather than keeping the flip.
    component.sortBy("name");
    expect(component.direction()).toBe("asc");
    expect(service.list).toHaveBeenCalledWith(jasmine.objectContaining({ sort: "name", direction: "asc" }));
  });

  it("onPageChange loads the requested page", () => {
    component.onPageChange(2);
    expect(component.page()).toBe(2);
  });

  it("openClient navigates to the client's profile", () => {
    component.openClient(client);
    expect(router.navigate).toHaveBeenCalledWith(["/admin/clients", "cl1"]);
  });

  it("openCreate resets the form and opens the modal", () => {
    component.createForm.patchValue({ first_name: "stale" });
    component.openCreate();
    expect(component.createModalOpen()).toBe(true);
    expect(component.createForm.value.first_name).toBe("");
  });

  it("closeCreateModal closes it", () => {
    component.createModalOpen.set(true);
    component.closeCreateModal();
    expect(component.createModalOpen()).toBe(false);
  });

  it("submitCreate does nothing with an invalid form", () => {
    component.submitCreate();
    expect(service.create).not.toHaveBeenCalled();
    expect(component.createForm.touched).toBe(true);
  });

  it("submitCreate creates the client and navigates to their profile", () => {
    component.createForm.patchValue({ first_name: "Amy", last_name: "Client", phone: "12345678" });
    service.create.and.returnValue(of({ client, contract: null, payment: null }));

    component.submitCreate();

    expect(component.createModalOpen()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(["/admin/clients", "cl1"]);
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("submitCreate shows the backend error on failure", () => {
    component.createForm.patchValue({ first_name: "Amy", last_name: "Client", phone: "12345678" });
    service.create.and.returnValue(throwError(() => new Error("nope")));

    component.submitCreate();

    expect(component.saving()).toBe(false);
    expect(component.formError()).toBeTruthy();
  });

  describe("the sign-up wizard", () => {
    const yoga = { id: "a1", name: "Yoga", emoji: "🧘", active: true } as never;
    const boxe = { id: "a2", name: "Boxe", emoji: "🥊", active: true } as never;
    const monthly = {
      id: "p1",
      name: "1 mois",
      active: true,
      activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 120 }],
      pack_prices: [{ pack_id: "k1", pack_name: "Duo", activity_names: ["Boxe", "Yoga"], price: 180 }],
    } as never;

    beforeEach(() => {
      const activities = TestBed.inject(ActivitiesService);
      spyOn(activities, "list").and.returnValue(of({ activities: [yoga, boxe] }));
      const plans = TestBed.inject(ContractTypesService);
      spyOn(plans, "list").and.returnValue(of({ plans: [monthly] }));
      component.openCreate();
    });

    it("starts on identity, and will not advance without a name and a number", () => {
      expect(component.step()).toBe(0);
      component.next();
      expect(component.step()).toBe(0);

      component.createForm.patchValue({ first_name: "Rania", last_name: "Ferjani", phone: "20000001" });
      component.next();
      expect(component.step()).toBe(1);
    });

    it("offers only the plans that price the chosen activity", () => {
      component.onItemChange("activity:a1");
      expect(component.plansForItem().map((p) => p.id)).toEqual(["p1"]);

      component.onItemChange("activity:a2");
      expect(component.plansForItem()).toEqual([]);
    });

    it("offers the packs some plan sells, and the plans that sell the chosen one", () => {
      expect(component.packsForSale()).toEqual([{ key: "pack:k1", label: "Duo (Boxe + Yoga)" }]);

      component.onItemChange("pack:k1");
      component.onPlanChange("p1");
      expect(component.plansForItem().map((p) => p.id)).toEqual(["p1"]);
      expect(component.total()).toBe(180);
    });

    it("forgets the last member's choices when the form opens again", () => {
      component.onItemChange("activity:a1");
      component.onPlanChange("p1");
      component.onDiscountChange(10);

      component.openCreate();

      expect(component.selectedItem()).toBe("");
      expect(component.selectedPlanId()).toBe("");
      expect(component.discount()).toBe(0);
    });

    it("drops a plan that no longer prices the newly chosen activity", () => {
      component.onItemChange("activity:a1");
      component.onPlanChange("p1");
      expect(component.selectedPlanId()).toBe("p1");

      component.onItemChange("activity:a2");
      expect(component.selectedPlanId()).toBe("");
    });

    it("prices the sale from the grid and takes the discount off it", () => {
      component.onItemChange("activity:a1");
      component.onPlanChange("p1");
      expect(component.total()).toBe(120);

      component.onDiscountChange(20);
      expect(component.total()).toBe(100);
    });

    it("never lets a discount push the total below zero", () => {
      component.onItemChange("activity:a1");
      component.onPlanChange("p1");
      component.onDiscountChange(500);
      expect(component.total()).toBe(0);
    });

    it("skips the payment step and saves when nothing was bought", () => {
      service.create.and.returnValue(of({ client, contract: null, payment: null }));
      component.createForm.patchValue({ first_name: "Sans", last_name: "Abonnement", phone: "20000002" });
      component.next();

      component.next();

      expect(component.step()).toBe(1);
      expect(service.create).toHaveBeenCalledWith(jasmine.any(Object), undefined);
    });

    it("sends the plan and the payment together when there is one", () => {
      service.create.and.returnValue(of({ client, contract: null, payment: null }));
      component.createForm.patchValue({ first_name: "Rania", last_name: "Ferjani", phone: "20000001" });
      component.next();
      component.onItemChange("activity:a1");
      component.onPlanChange("p1");
      component.next();
      expect(component.step()).toBe(2);

      component.submitCreate();

      const [, subscription] = service.create.calls.mostRecent().args;
      expect(subscription).toEqual(
        jasmine.objectContaining({ contract_type_id: "p1", activity_id: "a1", collect_payment: true, payment_method: "cash" })
      );
    });

    it("sends a pack in place of an activity", () => {
      service.create.and.returnValue(of({ client, contract: null, payment: null }));
      component.createForm.patchValue({ first_name: "Rania", last_name: "Ferjani", phone: "20000001" });
      component.next();
      component.onItemChange("pack:k1");
      component.onPlanChange("p1");
      component.next();

      component.submitCreate();

      const [, subscription] = service.create.calls.mostRecent().args;
      expect(subscription).toEqual(jasmine.objectContaining({ contract_type_id: "p1", pack_id: "k1" }));
      expect(subscription?.activity_id).toBeUndefined();
    });

    it("lets you step back but never jump forward", () => {
      component.createForm.patchValue({ first_name: "Rania", last_name: "Ferjani", phone: "20000001" });
      component.next();
      expect(component.step()).toBe(1);

      component.goToStep(2);
      expect(component.step()).toBe(1);

      component.goToStep(0);
      expect(component.step()).toBe(0);
    });
  });

  describe("what a row says about the subscription", () => {
    function withContract(overrides: Record<string, unknown>) {
      return { current_contract: { plan: { name: "Pilates" }, ...overrides } } as never;
    }

    it("leads with money owed, ahead of anything else", () => {
      const row = withContract({ payment_status: "unpaid", status: "active", remaining_bookings: 5 });

      expect(component.contractState(row)).toBe("payments.status_unpaid");
      expect(component.contractTone(row)).toBe("danger");
    });

    it("says expired when it has run out and nothing is owed", () => {
      const row = withContract({ payment_status: "paid", status: "expired", remaining_bookings: null });

      expect(component.contractState(row)).toBe("contract.status_expired");
      expect(component.contractTone(row)).toBe("danger");
    });

    it("counts the sessions left on a session card", () => {
      const row = withContract({ payment_status: "paid", status: "active", remaining_bookings: 3 });

      expect(component.contractState(row)).toBe("clients.sessions_left");
      expect(component.contractTone(row)).toBe("neutral");
    });

    it("warns when the card is nearly spent", () => {
      const row = withContract({ payment_status: "paid", status: "active", remaining_bookings: 1 });

      expect(component.contractTone(row)).toBe("warning");
    });

    it("gives the end date for an unlimited plan", () => {
      const row = withContract({
        payment_status: "paid", status: "active", remaining_bookings: null,
        expires_at: "2026-10-14T00:00:00Z",
      });

      expect(component.contractState(row)).toBe("clients.until");
    });

    it("says nothing at all when there is no subscription", () => {
      const row = { current_contract: null } as never;

      expect(component.contractState(row)).toBe("");
      expect(component.contractTone(row)).toBe("neutral");
    });
  });
});
