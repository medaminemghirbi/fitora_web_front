import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { BehaviorSubject, of } from "rxjs";
import { Activity } from "../../../core/models/activity.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { PacksService } from "../../../core/services/packs.service";
import { By } from "@angular/platform-browser";
import { PlansComponent } from "../plans/plans.component";
import { CatalogueComponent } from "./catalogue.component";

describe("CatalogueComponent", () => {
  const packsFeature = signal<Record<string, boolean>>({ packs: true });
  let fixture: ComponentFixture<CatalogueComponent>;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let router: jasmine.SpyObj<Router>;

  const yoga = { id: "a1", name: "Yoga", emoji: "🧘", active: true, session_format: "collective", duration: 60, capacity: 15, currency: "TND", prices: [] } as unknown as Activity;
  const boxe = { ...yoga, id: "a2", name: "Boxe" } as Activity;
  const monthly = {
    id: "p1", name: "Mensuel", active: true, currency: "TND", color: "#4a2a8f", billing_period: "monthly",
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 60 }], pack_prices: [],
  } as unknown as ContractType;

  function build(activities: Activity[], plans: ContractType[], tab: string | null = null): void {
    TestBed.resetTestingModule();
    const query = convertToParamMap(tab ? { tab } : {});
    params = new BehaviorSubject(query);
    router = jasmine.createSpyObj<Router>("Router", ["navigate"]);
    // Navigating only changes the query string here, as it does in the app.
    router.navigate.and.callFake((_commands, extras) => {
      params.next(convertToParamMap(extras?.queryParams ?? {}));
      return Promise.resolve(true);
    });

    const activitiesService = jasmine.createSpyObj<ActivitiesService>("ActivitiesService", ["list"]);
    activitiesService.list.and.returnValue(of({ activities }));
    const plansService = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list"]);
    plansService.list.and.returnValue(of({ plans }));
    const packsService = jasmine.createSpyObj<PacksService>("PacksService", ["list"]);
    packsService.list.and.returnValue(of({ packs: [] }));

    TestBed.configureTestingModule({
      imports: [CatalogueComponent, TranslateModule.forRoot()],
      providers: [
        // Packs are opt-in; these specs run a gym that turned them on.
        { provide: ConfigurationService, useValue: { features: packsFeature } },
        { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: query } } },
        { provide: Router, useValue: router },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: ContractTypesService, useValue: plansService },
        { provide: PacksService, useValue: packsService },
      ],
    });

    fixture = TestBed.createComponent(CatalogueComponent);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement;

  describe("an empty gym", () => {
    beforeEach(() => build([], []));

    it("shows the three steps, not two empty lists", () => {
      expect(el().querySelectorAll(".cat-step").length).toBe(3);
      expect(el().querySelector("app-plans")).toBeNull();
      expect(el().querySelector("app-activities")).toBeNull();
    });

    it("offers one way in — the activity — and says why the others wait", () => {
      const buttons = Array.from(el().querySelectorAll(".cat-step .btn")) as HTMLButtonElement[];
      expect(buttons.map((b) => b.disabled)).toEqual([false, true, true]);
      expect(el().querySelectorAll(".cat-step-state.is-muted").length).toBe(2);
    });
  });

  it("takes a step to the tab that owns its form, with the form open", () => {
    build([yoga, boxe], []);
    (el().querySelectorAll(".cat-step .btn")[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { tab: "formules", action: null } }));
    expect(el().querySelector("app-plans")).toBeTruthy();
    const plans = fixture.debugElement.query(By.directive(PlansComponent)).componentInstance as PlansComponent;
    expect(plans.planModalOpen()).toBe(true);
  });

  it("shows the price grid once there is an activity and a formule", () => {
    build([yoga], [monthly]);
    expect(el().querySelector("app-price-grid")).toBeTruthy();
    expect(el().querySelector(".cat-setup")).toBeNull();
  });

  it("counts what each tab holds", () => {
    build([yoga, boxe], [monthly]);
    const counts = Array.from(el().querySelectorAll(".cat-tab-count")).map((c) => c.textContent?.trim());
    expect(counts).toEqual(["2", "1", "0"]);
  });

  it("opens the tab named in the URL", () => {
    build([yoga], [monthly], "packs");
    expect(el().querySelector("app-packs")).toBeTruthy();
    expect(el().querySelector(".nav-link.active")?.textContent).toContain("catalogue.tab_packs");
  });

  describe("a studio that never turned packs on", () => {
    beforeEach(() => packsFeature.set({}));
    afterEach(() => packsFeature.set({ packs: true }));

    it("offers no packs tab", () => {
      build([yoga, boxe], [monthly]);
      const labels = Array.from(el().querySelectorAll(".nav-link")).map((t) => t.textContent ?? "");
      expect(labels.some((l) => l.includes("catalogue.tab_packs"))).toBe(false);
    });

    it("falls back to the prices when a link names the packs tab", () => {
      build([yoga], [monthly], "packs");
      expect(el().querySelector("app-packs")).toBeNull();
      expect(el().querySelector("app-price-grid")).toBeTruthy();
    });
  });
});
