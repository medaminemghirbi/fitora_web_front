import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Activity } from "../../../core/models/activity.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { Pack } from "../../../core/models/pack.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { PacksService } from "../../../core/services/packs.service";
import { ToastService } from "../../../core/services/toast.service";
import { CatalogueStore } from "./catalogue.store";
import { PriceGridComponent } from "./price-grid.component";

describe("PriceGridComponent", () => {
  const packsFeature = signal<Record<string, boolean>>({ packs: true });
  let fixture: ComponentFixture<PriceGridComponent>;
  let component: PriceGridComponent;
  let plans: jasmine.SpyObj<ContractTypesService>;
  let store: CatalogueStore;

  const yoga = { id: "a1", name: "Yoga", emoji: "🧘", active: true, currency: "TND" } as Activity;
  const boxe = { id: "a2", name: "Boxe", emoji: "🥊", active: true, currency: "TND" } as Activity;
  const duo = { id: "k1", name: "Duo", active: true, activity_ids: ["a1", "a2"], activities: [yoga, boxe] } as unknown as Pack;
  const monthly = {
    id: "p1", name: "Mensuel", active: true, currency: "TND", color: "#4a2a8f", billing_period: "monthly", session_count: null,
    activity_prices: [
      { activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 60 },
      { activity_id: "a2", activity_name: "Boxe", activity_emoji: "🥊", price: 70 },
    ],
    pack_prices: [],
  } as unknown as ContractType;
  const archived = { ...monthly, id: "p2", name: "Ancienne", active: false } as ContractType;

  beforeEach(() => {
    const activities = jasmine.createSpyObj<ActivitiesService>("ActivitiesService", ["list"]);
    activities.list.and.returnValue(of({ activities: [yoga, boxe] }));
    plans = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list", "update"]);
    plans.list.and.returnValue(of({ plans: [monthly, archived] }));
    const packs = jasmine.createSpyObj<PacksService>("PacksService", ["list"]);
    packs.list.and.returnValue(of({ packs: [duo] }));

    TestBed.configureTestingModule({
      imports: [PriceGridComponent, TranslateModule.forRoot()],
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
    store.loadOnce();
    fixture = TestBed.createComponent(PriceGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function blurWith(selector: string, value: string): HTMLInputElement {
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("blur"));
    return input;
  }

  const cell = (row: string, plan = "Mensuel") => `input[aria-label="${row} — ${plan}"]`;

  it("lays out a row per activity and pack, and a column per active formule", () => {
    expect(fixture.nativeElement.querySelectorAll("thead .pg-plan").length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll("tbody .pg-row").length).toBe(3);
    expect((fixture.nativeElement.querySelector(cell("Yoga")) as HTMLInputElement).value).toBe("60");
    expect(fixture.nativeElement.querySelector(".pg-foot")).toBeTruthy(); // the inactive one is mentioned
  });

  it("flags a row no formule sells", () => {
    expect(component.soldIn("pack", "k1")).toBe(0);
    expect(fixture.nativeElement.querySelectorAll(".pg-unsold").length).toBe(1);
  });

  it("reprices one cell, sending that formule's activity list with the change", () => {
    const repriced = { ...monthly, activity_prices: [monthly.activity_prices[0], { ...monthly.activity_prices[1], price: 75 }] };
    plans.update.and.returnValue(of({ plan: repriced }));

    blurWith(cell("Boxe"), "75");

    expect(plans.update).toHaveBeenCalledWith("p1", {
      activity_prices: [{ activity_id: "a1", price: 60 }, { activity_id: "a2", price: 75 }],
    });
    expect(store.plans()[0]).toBe(repriced);
  });

  it("stops selling a row when its cell is cleared", () => {
    plans.update.and.returnValue(of({ plan: monthly }));
    blurWith(cell("Yoga"), "");
    expect(plans.update).toHaveBeenCalledWith("p1", { activity_prices: [{ activity_id: "a2", price: 70 }] });
  });

  it("prices a pack through the pack list only", () => {
    plans.update.and.returnValue(of({ plan: monthly }));
    blurWith(cell("Duo"), "110,5");
    expect(plans.update).toHaveBeenCalledWith("p1", { pack_prices: [{ pack_id: "k1", price: 110.5 }] });
  });

  it("sends nothing when the value did not change", () => {
    blurWith(cell("Yoga"), "60");
    expect(plans.update).not.toHaveBeenCalled();
  });

  it("puts back a value that is not a price", () => {
    const input = blurWith(cell("Yoga"), "abc");
    expect(plans.update).not.toHaveBeenCalled();
    expect(input.value).toBe("60");
  });

  it("puts the old price back and says why when the save fails", () => {
    plans.update.and.returnValue(throwError(() => new Error("nope")));
    const input = blurWith(cell("Yoga"), "99");
    expect(input.value).toBe("60");
    expect(TestBed.inject(ToastService).toasts()[0].kind).toBe("error");
  });

  it("asks the page for a formule or a pack it cannot create itself", () => {
    const asked: string[] = [];
    component.requestCreate.subscribe((kind) => asked.push(kind));
    (fixture.nativeElement.querySelector(".pg-actions .btn-primary") as HTMLButtonElement).click();
    expect(asked).toEqual(["plan"]);
  });
});
