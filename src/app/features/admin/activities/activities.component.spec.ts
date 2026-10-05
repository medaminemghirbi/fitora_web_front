import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Activity } from "../../../core/models/activity.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ActivityTemplatesService } from "../../../core/services/activity-templates.service";
import { ActivityTemplate } from "../../../core/models/activity-template.model";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ToastService } from "../../../core/services/toast.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { PacksService } from "../../../core/services/packs.service";
import { ContractType } from "../../../core/models/contract-type.model";
import { Pack } from "../../../core/models/pack.model";
import { CatalogueStore } from "../catalogue/catalogue.store";
import { ActivitiesComponent } from "./activities.component";

describe("ActivitiesComponent", () => {
  const packsFeature = signal<Record<string, boolean>>({ packs: true });
  let fixture: ComponentFixture<ActivitiesComponent>;
  let component: ActivitiesComponent;
  let activitiesService: jasmine.SpyObj<ActivitiesService>;
  let confirmService: ConfirmService;
  let toast: ToastService;
  let templatesService: jasmine.SpyObj<ActivityTemplatesService>;

  const boxe: ActivityTemplate = {
    id: "t-boxe", key: "boxe", family: "combat", emoji: "🥊", names: { fr: "Boxe" },
    session_format: "collective", duration: 60, capacity: 16,
  };

  const activity: Activity = {
    id: "a1", name: "Yoga", emoji: "🧘", description: null,
    session_format: "collective", duration: 60, capacity: 15, active: true,
    currency: "TND", prices: [{ contract_type_id: "ct1", contract_type_name: "1 Mois", billing_period: "monthly", price: 50 }],
  };

  // The prices an activity shows are read off the formules, not off the
  // activity's own `prices` — so a price typed in the grid shows at once.
  const plan = {
    id: "ct1", name: "Mensuel", currency: "TND", active: true,
    activity_prices: [{ activity_id: "a1", activity_name: "Yoga", activity_emoji: "🧘", price: 65 }], pack_prices: [],
  } as unknown as ContractType;
  const pack = { id: "k1", name: "Duo", active: true, activity_ids: ["a1", "a2"], activities: [], prices: [] } as unknown as Pack;

  function build(queryParams: Record<string, string> = {}, listError = false): void {
    TestBed.resetTestingModule();
    activitiesService = jasmine.createSpyObj("ActivitiesService", ["list", "create", "update", "deactivate", "adopt"]);
    templatesService = jasmine.createSpyObj<ActivityTemplatesService>("ActivityTemplatesService", ["list"]);
    templatesService.list.and.returnValue(of({ activity_templates: [boxe] }));
    activitiesService.list.and.returnValue(listError ? throwError(() => new Error("nope")) : of({ activities: [activity] }));
    const contractTypes = jasmine.createSpyObj<ContractTypesService>("ContractTypesService", ["list"]);
    contractTypes.list.and.returnValue(of({ plans: [plan] }));
    const packs = jasmine.createSpyObj<PacksService>("PacksService", ["list"]);
    packs.list.and.returnValue(of({ packs: [pack] }));

    TestBed.configureTestingModule({
      imports: [ActivitiesComponent, TranslateModule.forRoot()],
      providers: [
        // Packs are opt-in; these specs run a gym that turned them on.
        { provide: ConfigurationService, useValue: { features: packsFeature } },
        CatalogueStore,
        { provide: ContractTypesService, useValue: contractTypes },
        { provide: PacksService, useValue: packs },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: ActivityTemplatesService, useValue: templatesService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });

    fixture = TestBed.createComponent(ActivitiesComponent);
    component = fixture.componentInstance;
    confirmService = TestBed.inject(ConfirmService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    TestBed.flushEffects();
  }

  beforeEach(() => build());

  it("loads activities on init", () => {
    expect(component.activities()).toEqual([activity]);
  });

  it("sets the error flag when loading fails", () => {
    build({}, true);
    expect(component.error()).toBe(true);
  });

  it("keeps the list on screen when a later refresh fails", () => {
    activitiesService.list.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(false);
    expect(component.activities()).toEqual([activity]);
  });

  it("reads its prices off the formules", () => {
    expect(component.pricesOf(activity).map((row) => row.price)).toEqual([65]);
  });

  it("names the packs it is sold in", () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(".act-packs")?.textContent).toContain("Duo");
  });

  it("opens the catalogue automatically for ?action=new — a gym starts from it", () => {
    build({ action: "new" });
    expect(component.catalogueOpen()).toBe(true);
    expect(component.templates()).toEqual([boxe]);
  });

  it("filtered/meta reflect the search term", () => {
    component.search.set("yoga");
    expect(component.filtered().length).toBe(1);
    component.search.set("zzz");
    expect(component.meta().total).toBe(0);
  });

  it("changing the search term resets to page 1", () => {
    component.page.set(3);
    component.search.set("y");
    fixture.detectChanges();
    expect(component.page()).toBe(1);
  });

  describe("session format / capacity coherence", () => {
    it("switching to individual locks capacity at 1 and disables the field", () => {
      component.form.controls.session_format.setValue("individual");
      expect(component.form.controls.capacity.value).toBe(1);
      expect(component.form.controls.capacity.disabled).toBe(true);
    });

    it("switching to small_group re-enables capacity and snaps out-of-range values to the preset", () => {
      component.form.controls.session_format.setValue("individual");
      component.form.controls.session_format.setValue("small_group");
      expect(component.form.controls.capacity.enabled).toBe(true);
      expect(component.form.controls.capacity.value).toBe(6);
    });

    it("keeps an in-range capacity value when switching formats", () => {
      component.form.patchValue({ capacity: 5 });
      component.form.controls.session_format.setValue("small_group");
      expect(component.form.controls.capacity.value).toBe(5);
    });
  });

  it("openCreate resets to the collective defaults", () => {
    component.openCreate();
    expect(component.editing()).toBeNull();
    expect(component.form.value.session_format).toBe("collective");
    expect(component.capacityBounds()).toEqual({ min: 10, max: null });
    expect(component.modalOpen()).toBe(true);
  });

  it("openEdit hydrates the form and applies that activity's format bounds", () => {
    const individual: Activity = { ...activity, session_format: "individual", capacity: 1 };
    component.openEdit(individual);
    expect(component.editing()).toBe(individual);
    expect(component.capacityBounds()).toEqual({ min: 1, max: 1 });
  });

  it("openEdit falls back to an empty emoji/description when the activity has none", () => {
    const bare: Activity = { ...activity, emoji: null, description: null };
    component.openEdit(bare);
    expect(component.form.value.emoji).toBe("");
    expect(component.form.value.description).toBe("");
  });

  it("closeModal closes it", () => {
    component.modalOpen.set(true);
    component.closeModal();
    expect(component.modalOpen()).toBe(false);
  });

  it("selectEmoji toggles the same emoji off, or sets a new one", () => {
    component.selectEmoji("🔥");
    expect(component.form.value.emoji).toBe("🔥");
    component.selectEmoji("🔥");
    expect(component.form.value.emoji).toBe("");
  });

  it("does not submit when required fields are missing", () => {
    component.openCreate();
    component.form.patchValue({ name: "" });
    component.submit();
    expect(activitiesService.create).not.toHaveBeenCalled();
  });

  it("creates an activity", () => {
    activitiesService.create.and.returnValue(of({ activity }));
    component.openCreate();
    component.form.patchValue({ name: "Yoga" });
    component.submit();
    expect(activitiesService.create).toHaveBeenCalledWith(jasmine.objectContaining({ name: "Yoga" }));
    expect(component.modalOpen()).toBe(false);
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("updates an existing activity", () => {
    component.openEdit(activity);
    activitiesService.update.and.returnValue(of({ activity }));
    component.submit();
    expect(activitiesService.update).toHaveBeenCalledWith("a1", jasmine.any(Object));
  });

  it("shows the backend error on failure", () => {
    component.openCreate();
    component.form.patchValue({ name: "Yoga" });
    activitiesService.create.and.returnValue(throwError(() => new Error("nope")));
    component.submit();
    expect(component.formError()).toBeTruthy();
  });

  it("deactivate does nothing when declined", async () => {
    spyOn(confirmService, "ask").and.resolveTo(false);
    await component.deactivate(activity);
    expect(activitiesService.deactivate).not.toHaveBeenCalled();
  });

  it("deactivate deactivates on confirmation", async () => {
    spyOn(confirmService, "ask").and.resolveTo(true);
    activitiesService.deactivate.and.returnValue(of({ activity }));
    await component.deactivate(activity);
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("deactivate shows an error toast on failure", async () => {
    spyOn(confirmService, "ask").and.resolveTo(true);
    activitiesService.deactivate.and.returnValue(throwError(() => new Error("nope")));
    await component.deactivate(activity);
    expect(toast.toasts()[0].kind).toBe("error");
  });

  describe("adding from the catalogue", () => {
    it("loads the catalogue once, however often it is opened", () => {
      component.openCatalogue();
      component.closeCatalogue();
      component.openCatalogue();

      expect(templatesService.list).toHaveBeenCalledTimes(1);
      expect(component.catalogueSelection()).toEqual([]);
    });

    it("marks the templates the gym already teaches", () => {
      activitiesService.list.and.returnValue(of({ activities: [{ ...activity, activity_template_id: "t-boxe" }] }));
      component.load();

      expect(component.adoptedTemplateIds()).toEqual(["t-boxe"]);
    });

    it("adds the picked templates, then reloads", () => {
      activitiesService.adopt.and.returnValue(of({ activities: [activity] }));
      component.openCatalogue();
      component.catalogueSelection.set(["t-boxe"]);

      component.adoptSelected();

      expect(activitiesService.adopt).toHaveBeenCalledWith(["t-boxe"]);
      expect(component.catalogueOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("adds nothing when nothing is picked", () => {
      component.openCatalogue();
      component.adoptSelected();

      expect(activitiesService.adopt).not.toHaveBeenCalled();
    });

    it("keeps the dialog open and says why when adding fails", () => {
      activitiesService.adopt.and.returnValue(throwError(() => new Error("nope")));
      component.openCatalogue();
      component.catalogueSelection.set(["t-boxe"]);

      component.adoptSelected();

      expect(component.catalogueOpen()).toBe(true);
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("hands over to the blank form for something the catalogue lacks", () => {
      component.openCatalogue();
      component.createFromScratch();

      expect(component.catalogueOpen()).toBe(false);
      expect(component.modalOpen()).toBe(true);
    });
  });
});
