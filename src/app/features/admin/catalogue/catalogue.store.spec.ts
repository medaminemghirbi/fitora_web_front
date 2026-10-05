import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { of, throwError } from "rxjs";
import { Activity } from "../../../core/models/activity.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { Pack } from "../../../core/models/pack.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { PacksService } from "../../../core/services/packs.service";
import { CatalogueStore } from "./catalogue.store";

describe("CatalogueStore", () => {
  const packsFeature = signal<Record<string, boolean>>({ packs: true });
  let store: CatalogueStore;
  let activities: jasmine.SpyObj<ActivitiesService>;
  let plans: jasmine.SpyObj<ContractTypesService>;
  let packs: jasmine.SpyObj<PacksService>;

  const yoga = { id: "a1", name: "Yoga", active: true } as Activity;
  const boxe = { id: "a2", name: "Boxe", active: false } as Activity;
  const duo = { id: "k1", name: "Duo", active: true, activity_ids: ["a1", "a2"] } as Pack;
  const monthly = {
    id: "p1", name: "Mensuel", active: true,
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: null, price: "60.0" as unknown as number }],
    pack_prices: [{ pack_id: "k1", pack_name: "Duo", activity_names: ["Boxe", "Yoga"], price: 110 }],
  } as ContractType;

  beforeEach(() => {
    activities = jasmine.createSpyObj("ActivitiesService", ["list"]);
    plans = jasmine.createSpyObj("ContractTypesService", ["list"]);
    packs = jasmine.createSpyObj("PacksService", ["list"]);
    activities.list.and.returnValue(of({ activities: [yoga, boxe] }));
    plans.list.and.returnValue(of({ plans: [monthly] }));
    packs.list.and.returnValue(of({ packs: [duo] }));

    TestBed.configureTestingModule({
      providers: [
        // Packs are opt-in; these specs run a gym that turned them on.
        { provide: ConfigurationService, useValue: { features: packsFeature } },
        CatalogueStore,
        { provide: ActivitiesService, useValue: activities },
        { provide: ContractTypesService, useValue: plans },
        { provide: PacksService, useValue: packs },
      ],
    });
    store = TestBed.inject(CatalogueStore);
  });

  it("loads the three lists together, once, however many tabs ask", () => {
    store.loadOnce();
    store.loadOnce();

    expect(activities.list).toHaveBeenCalledTimes(1);
    expect(store.plans()).toEqual([monthly]);
    expect(store.packs()).toEqual([duo]);
    expect(store.loading()).toBe(false);
  });

  it("keeps active and inactive apart", () => {
    store.loadOnce();
    expect(store.activeActivities()).toEqual([yoga]);
  });

  it("refreshes in place after the first load, without going back to loading", () => {
    store.loadOnce();
    const states: boolean[] = [];
    plans.list.and.callFake(() => {
      states.push(store.loading());
      return of({ plans: [] });
    });

    store.reload();

    expect(states).toEqual([false]);
    expect(store.plans()).toEqual([]);
  });

  it("only errors a page that has nothing to show", () => {
    plans.list.and.returnValue(throwError(() => new Error("nope")));
    store.loadOnce();
    expect(store.error()).toBe(true);
  });

  it("reads prices off the formules, numbers not strings", () => {
    store.loadOnce();
    expect(store.pricesForActivity("a1")).toEqual([{ plan: monthly, price: 60 }]);
    expect(store.pricesForPack("k1")).toEqual([{ plan: monthly, price: 110 }]);
    expect(store.pricesForActivity("a2")).toEqual([]);
  });

  it("finds the packs an activity is in", () => {
    store.loadOnce();
    expect(store.packsWith("a2")).toEqual([duo]);
  });

  it("hands a create request to the tab that owns it, once", () => {
    store.requestCreate("pack");

    expect(store.takeCreateRequest("plan")).toBe(false);
    expect(store.takeCreateRequest("pack")).toBe(true);
    expect(store.takeCreateRequest("pack")).toBe(false);
  });

  it("swaps in one formule without touching the others", () => {
    store.loadOnce();
    const repriced = { ...monthly, name: "Mensuel+" };
    store.replacePlan(repriced);
    expect(store.plans()).toEqual([repriced]);
  });
});
