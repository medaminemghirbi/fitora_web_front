import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { ContractType } from "../../../core/models/contract-type.model";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { ActivitiesService } from "../../../core/services/activities.service";
import { Activity } from "../../../core/models/activity.model";
import { ToastService } from "../../../core/services/toast.service";
import { PacksService } from "../../../core/services/packs.service";
import { Pack } from "../../../core/models/pack.model";
import { CatalogueStore } from "../catalogue/catalogue.store";
import { PlansComponent } from "./plans.component";

describe("PlansComponent", () => {
  const packsFeature = signal<Record<string, boolean>>({ packs: true });
  let fixture: ComponentFixture<PlansComponent>;
  let component: PlansComponent;
  let service: jasmine.SpyObj<ContractTypesService>;
  let activitiesService: jasmine.SpyObj<ActivitiesService>;
  let toast: ToastService;
  let store: CatalogueStore;

  const plan: ContractType = {
    id: "ct1", company_id: "1", name: "Basic", description: null, currency: "TND",
    billing_period: "monthly", duration_days: 30, validity_days: null, session_count: null, unlimited_bookings: true,
    booking_limit: null, priority_booking: false, color: "#000", active: true, activity_ids: [],
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 100 }],
    pack_prices: [],
  };

  const pack: Pack = {
    id: "k1", name: "Duo", description: null, active: true, currency: "TND", activity_ids: ["a1", "a2"],
    activities: [{ id: "a1", name: "Yoga", emoji: "🧘" }, { id: "a2", name: "Boxe", emoji: "🥊" }], prices: [],
  };

  const activity: Activity = {
    id: "a1", name: "Yoga", emoji: "🧘", description: null,
    session_format: "collective", duration: 60, capacity: 15, active: true, currency: "TND", prices: [],
  };

  function build(queryParams: Record<string, string> = {}, listError = false): void {
    TestBed.resetTestingModule();
    service = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list", "create", "update"]);
    service.list.and.returnValue(listError ? throwError(() => new Error("nope")) : of({ plans: [plan] }));
    activitiesService = jasmine.createSpyObj<ActivitiesService>("ActivitiesService", ["list"]);
    activitiesService.list.and.returnValue(of({ activities: [activity] }));
    const packsService = jasmine.createSpyObj<PacksService>("PacksService", ["list"]);
    packsService.list.and.returnValue(of({ packs: [pack] }));

    TestBed.configureTestingModule({
      imports: [PlansComponent, TranslateModule.forRoot()],
      providers: [
        // Packs are opt-in; these specs run a gym that turned them on.
        { provide: ConfigurationService, useValue: { features: packsFeature } },
        // The catalogue page provides the store; a tab on its own needs one too.
        CatalogueStore,
        { provide: ContractTypesService, useValue: service },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: PacksService, useValue: packsService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });

    fixture = TestBed.createComponent(PlansComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    store = TestBed.inject(CatalogueStore);
    fixture.detectChanges();
    TestBed.flushEffects();
  }

  beforeEach(() => build());

  it("loads plans on init", () => {
    expect(component.plans()).toEqual([plan]);
  });

  it("stops loading even when the initial load fails", () => {
    build({}, true);
    expect(component.loading()).toBe(false);
  });

  it("opens the create modal automatically for ?action=new", () => {
    build({ action: "new" });
    expect(component.planModalOpen()).toBe(true);
  });

  it("filtered/meta reflect the search term", () => {
    component.search.set("basic");
    expect(component.filtered().length).toBe(1);
    component.search.set("zzz");
    expect(component.meta().total).toBe(0);
  });

  it("lists the 4 fixed billing periods, then a studio's custom-length carnet", () => {
    expect(component.billingPeriods).toEqual(["monthly", "quarterly", "semi_annual", "yearly", "custom"]);
  });

  it("openCreatePlan resets the form", () => {
    component.openCreatePlan();
    expect(component.editingPlan()).toBeNull();
    expect(component.planModalOpen()).toBe(true);
  });

  it("openEditPlan hydrates the form and the pricing grid", () => {
    component.openEditPlan(plan);
    expect(component.editingPlan()).toBe(plan);
    expect(component.planForm.value.name).toBe("Basic");
    expect(component.priceFor("a1")).toBe(100);
  });

  it("setPrice stores a typed price and drops the row when the field is cleared", () => {
    component.openCreatePlan();
    component.setPrice("a1", { target: { value: "70" } } as unknown as Event);
    expect(component.priceFor("a1")).toBe(70);

    component.setPrice("a1", { target: { value: "" } } as unknown as Event);
    expect(component.priceFor("a1")).toBeNull();
  });

  it("submitPlan refuses a plan with no priced activity", () => {
    component.openCreatePlan();
    component.planForm.patchValue({ name: "Premium" });
    component.submitPlan();
    expect(service.create).not.toHaveBeenCalled();
    expect(component.formError()).toBeTruthy();
  });

  it("closePlanModal closes it", () => {
    component.planModalOpen.set(true);
    component.closePlanModal();
    expect(component.planModalOpen()).toBe(false);
  });

  it("submitPlan does nothing with an invalid form", () => {
    component.planForm.reset();
    component.submitPlan();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("submitPlan creates a new plan with its pricing grid", () => {
    component.openCreatePlan();
    component.planForm.patchValue({ name: "Premium" });
    component.setPrice("a1", { target: { value: "70" } } as unknown as Event);
    service.create.and.returnValue(of({ plan }));
    component.submitPlan();
    expect(service.create).toHaveBeenCalledWith(jasmine.objectContaining({ activity_prices: [{ activity_id: "a1", price: 70 }] }));
    expect(component.planModalOpen()).toBe(false);
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("sells a carnet with its own lifetime", () => {
    component.openCreatePlan();
    component.planForm.patchValue({ name: "10 séances", billing_period: "custom", validity_days: 56, unlimited_bookings: false, session_count: 10 });
    component.setPrice("a1", { target: { value: "300" } } as unknown as Event);
    service.create.and.returnValue(of({ plan }));

    component.submitPlan();

    expect(service.create).toHaveBeenCalledWith(jasmine.objectContaining({ billing_period: "custom", validity_days: 56 }));
  });

  it("refuses a custom period with no validity", () => {
    component.openCreatePlan();
    component.planForm.patchValue({ name: "10 séances", billing_period: "custom", validity_days: null });
    component.setPrice("a1", { target: { value: "300" } } as unknown as Event);

    component.submitPlan();

    expect(service.create).not.toHaveBeenCalled();
    expect(component.formError()).toBeTruthy();
  });

  it("drops a validity left over once the period is fixed again", () => {
    component.openCreatePlan();
    component.planForm.patchValue({ name: "Mensuel", billing_period: "monthly", validity_days: 56 });
    component.setPrice("a1", { target: { value: "80" } } as unknown as Event);
    service.create.and.returnValue(of({ plan }));

    component.submitPlan();

    expect(service.create).toHaveBeenCalledWith(jasmine.objectContaining({ billing_period: "monthly", validity_days: null }));
  });

  it("hydrates and sends the packs' prices beside the activities'", () => {
    component.openEditPlan({ ...plan, pack_prices: [{ pack_id: "k1", pack_name: "Duo", activity_names: ["Boxe", "Yoga"], price: 150 }] });
    expect(component.packPriceFor("k1")).toBe(150);

    component.setPackPrice("k1", { target: { value: "140" } } as unknown as Event);
    service.update.and.returnValue(of({ plan }));
    component.submitPlan();

    expect(service.update).toHaveBeenCalledWith("ct1", jasmine.objectContaining({ pack_prices: [{ pack_id: "k1", price: 140 }] }));
  });

  it("accepts a formule that sells only a pack", () => {
    component.openCreatePlan();
    component.planForm.patchValue({ name: "Pack only" });
    component.setPackPrice("k1", { target: { value: "150" } } as unknown as Event);
    service.create.and.returnValue(of({ plan }));
    component.submitPlan();

    expect(service.create).toHaveBeenCalledWith(jasmine.objectContaining({ activity_prices: [], pack_prices: [{ pack_id: "k1", price: 150 }] }));
  });

  it("lists the gym's packs in the form's price grid", () => {
    component.openCreatePlan();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("#mp-pack-k1")).toBeTruthy();
  });

  it("submitPlan updates an existing plan", () => {
    component.openEditPlan(plan);
    service.update.and.returnValue(of({ plan }));
    component.submitPlan();
    expect(service.update).toHaveBeenCalledWith("ct1", jasmine.any(Object));
  });

  it("submitPlan shows the backend error on failure", () => {
    component.openCreatePlan();
    component.planForm.patchValue({ name: "Premium" });
    component.setPrice("a1", { target: { value: "70" } } as unknown as Event);
    service.create.and.returnValue(throwError(() => new Error("nope")));
    component.submitPlan();
    expect(component.formError()).toBeTruthy();
  });

  describe("a gym with no activities yet", () => {
    beforeEach(() => {
      store.activities.set([]);
      store.packs.set([]);
      fixture.detectChanges();
    });

    it("offers the activity it needs first, not a formule nobody can price", () => {
      store.plans.set([]);
      fixture.detectChanges();
      const emitted: string[] = [];
      component.requestCreate.subscribe((kind) => emitted.push(kind));

      expect(fixture.nativeElement.querySelector(".plan-needs")).toBeTruthy();
      (fixture.nativeElement.querySelector(".fx-state .btn-primary") as HTMLButtonElement).click();

      expect(emitted).toEqual(["activity"]);
      expect(component.planModalOpen()).toBe(false);
    });

    it("shows a single way to create a formule when the list is empty", () => {
      store.activities.set([activity]);
      store.plans.set([]);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector(".fx-toolbar")).toBeNull();
      expect(fixture.nativeElement.querySelectorAll(".fx-state .btn-primary").length).toBe(1);
    });

    it("says what to do instead of asking for a price there is no field for", () => {
      component.planModalOpen.set(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector(".alert-warning")).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll(".fx-price-grid-row").length).toBe(0);
    });

    it("cannot be submitted into the dead end", () => {
      component.planModalOpen.set(true);
      fixture.detectChanges();

      const save = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    });
  });
});
