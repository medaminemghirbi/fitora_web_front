import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Activity } from "../../../core/models/activity.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { Pack } from "../../../core/models/pack.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { PacksService } from "../../../core/services/packs.service";
import { CatalogueStore } from "../catalogue/catalogue.store";
import { PacksComponent } from "./packs.component";

describe("PacksComponent", () => {
  const packsFeature = signal<Record<string, boolean>>({ packs: true });
  let fixture: ComponentFixture<PacksComponent>;
  let component: PacksComponent;
  let packs: jasmine.SpyObj<PacksService>;
  let plans: jasmine.SpyObj<ContractTypesService>;
  let store: CatalogueStore;

  const yoga = { id: "a1", name: "Yoga", emoji: "🧘", active: true } as Activity;
  const boxe = { id: "a2", name: "Boxe", emoji: "🥊", active: true } as Activity;
  const duo: Pack = {
    id: "k1", name: "Duo", description: null, active: true, currency: "TND", activity_ids: ["a1", "a2"],
    activities: [{ id: "a2", name: "Boxe", emoji: "🥊" }, { id: "a1", name: "Yoga", emoji: "🧘" }], prices: [],
  };
  const monthly = {
    id: "p1", name: "Mensuel", active: true, currency: "TND", billing_period: "monthly",
    activity_prices: [
      { activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 60 },
      { activity_id: "a2", activity_name: "Boxe", activity_emoji: "🥊", price: 70 },
    ],
    pack_prices: [{ pack_id: "k1", pack_name: "Duo", activity_names: ["Boxe", "Yoga"], price: 110 }],
  } as unknown as ContractType;
  const yearly = { ...monthly, id: "p2", name: "Annuel", pack_prices: [] } as unknown as ContractType;

  function build(activityList: Activity[] = [yoga, boxe], packList: Pack[] = [duo]): void {
    TestBed.resetTestingModule();
    const activities = jasmine.createSpyObj<ActivitiesService>("ActivitiesService", ["list"]);
    activities.list.and.returnValue(of({ activities: activityList }));
    plans = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list", "update"]);
    plans.list.and.returnValue(of({ plans: [monthly, yearly] }));
    plans.update.and.returnValue(of({ plan: monthly }));
    packs = jasmine.createSpyObj<PacksService>("PacksService", ["list", "create", "update", "deactivate"]);
    packs.list.and.returnValue(of({ packs: packList }));
    packs.create.and.returnValue(of({ pack: { ...duo, id: "k9" } }));
    packs.update.and.returnValue(of({ pack: duo }));

    TestBed.configureTestingModule({
      imports: [PacksComponent, TranslateModule.forRoot()],
      providers: [
        // Packs are opt-in; these specs run a gym that turned them on.
        { provide: ConfigurationService, useValue: { features: packsFeature } },
        CatalogueStore,
        { provide: ActivitiesService, useValue: activities },
        { provide: ContractTypesService, useValue: plans },
        { provide: PacksService, useValue: packs },
      ],
    });

    fixture = TestBed.createComponent(PacksComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(CatalogueStore);
    fixture.detectChanges();
    TestBed.flushEffects();
  }

  beforeEach(() => build());

  it("shows each pack with its activities and its price per formule", () => {
    const card = fixture.nativeElement.querySelector(".pk-card") as HTMLElement;
    expect(card.textContent).toContain("Boxe");
    expect(card.querySelectorAll(".pk-prices li").length).toBe(1);
  });

  it("warns about a pack no formule sells yet", () => {
    store.plans.set([yearly]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(".pk-warn")).toBeTruthy();
  });

  describe("a gym with fewer than two activities", () => {
    beforeEach(() => build([yoga], []));

    it("says why there can be no pack yet and offers the activity instead", () => {
      const asked: string[] = [];
      component.requestCreate.subscribe((kind) => asked.push(kind));

      expect(fixture.nativeElement.querySelector(".pk-needs")).toBeTruthy();
      (fixture.nativeElement.querySelector(".fx-state .btn") as HTMLButtonElement).click();

      expect(asked).toEqual(["activity"]);
    });

    it("does not open a form nobody can complete", () => {
      component.openCreate();
      expect(component.modalOpen()).toBe(false);
    });
  });

  it("opens when the page asks for a new pack", () => {
    store.requestCreate("pack");
    TestBed.flushEffects();
    expect(component.modalOpen()).toBe(true);
  });

  it("refuses a pack of one activity", () => {
    component.openCreate();
    component.form.patchValue({ name: "Solo" });
    component.toggle("a1");
    component.submit();

    expect(packs.create).not.toHaveBeenCalled();
    expect(component.formError()).toBeTruthy();
  });

  it("creates the pack, then writes its price onto the formules it was priced for, and only those", () => {
    component.openCreate();
    component.form.patchValue({ name: "Trio" });
    component.toggle("a1");
    component.toggle("a2");
    component.setPrice("p2", { target: { value: "1000" } } as unknown as Event);
    component.submit();

    expect(packs.create).toHaveBeenCalledWith(jasmine.objectContaining({ name: "Trio", activity_ids: ["a1", "a2"] }));
    expect(plans.update).toHaveBeenCalledTimes(1);
    expect(plans.update).toHaveBeenCalledWith("p2", { pack_prices: [{ pack_id: "k9", price: 1000 }] });
    expect(component.modalOpen()).toBe(false);
  });

  it("leaves a formule alone when the pack's price there did not change", () => {
    component.openEdit(duo);
    expect(component.priceFor("p1")).toBe(110);
    component.submit();

    expect(packs.update).toHaveBeenCalled();
    expect(plans.update).not.toHaveBeenCalled();
  });

  it("takes the pack off a formule when its price is cleared, keeping the formule's other packs", () => {
    const withTwo = {
      ...monthly,
      pack_prices: [...monthly.pack_prices, { pack_id: "k2", pack_name: "Autre", activity_names: [], price: 90 }],
    } as ContractType;
    store.plans.set([withTwo, yearly]);
    component.openEdit(duo);
    component.setPrice("p1", { target: { value: "" } } as unknown as Event);
    component.submit();

    expect(plans.update).toHaveBeenCalledWith("p1", { pack_prices: [{ pack_id: "k2", price: 90 }] });
  });

  it("shows what the ticked activities would cost one by one", () => {
    component.openEdit(duo);
    expect(component.separately(monthly)).toBe(130);
  });

  it("keeps the form open with the reason when the save fails", () => {
    packs.update.and.returnValue(throwError(() => new Error("nope")));
    component.openEdit(duo);
    component.submit();

    expect(component.modalOpen()).toBe(true);
    expect(component.formError()).toBeTruthy();
  });

  it("deactivates after asking", async () => {
    spyOn(TestBed.inject(ConfirmService), "ask").and.resolveTo(true);
    packs.deactivate.and.returnValue(of({ pack: { ...duo, active: false } }));

    await component.deactivate(duo);

    expect(packs.deactivate).toHaveBeenCalledWith("k1");
  });
});
