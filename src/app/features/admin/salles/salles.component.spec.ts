import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { CompanyNetwork, CompanyService } from "../../../core/services/company.service";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { ToastService } from "../../../core/services/toast.service";
import { SallesComponent } from "./salles.component";

describe("SallesComponent", () => {
  let fixture: ComponentFixture<SallesComponent>;
  let component: SallesComponent;
  let service: jasmine.SpyObj<CompanyService>;
  let toast: ToastService;
  let reload: jasmine.Spy;

  const network: CompanyNetwork = {
    companies: [
      { id: "s1", name: "Salle Sousse", logo_url: null, currency: "TND", active: true, city: "Sousse", members_count: 120, moderator_ids: ["m1", "m2"] },
      { id: "s2", name: "Salle Tunis", logo_url: null, currency: "TND", active: false, city: null, members_count: 40, moderator_ids: ["m1"] },
    ],
    moderators: [
      { id: "m1", full_name: "Amira", email: "amira@x.test", role_name: "Modérateur", role_key: "moderator", active: true, company_ids: ["s1", "s2"] },
      { id: "m2", full_name: "Karim", email: "karim@x.test", role_name: "Modérateur", role_key: "moderator", active: true, company_ids: ["s1"] },
      { id: "m3", full_name: "Sami", email: "sami@x.test", role_name: "Comptable", role_key: "comptable", active: true, company_ids: ["s1"] },
    ],
  };

  function build(payload: CompanyNetwork = network, subscription: object = { plan: "pro", multi_salle: true, pro_features: true }): void {
    TestBed.resetTestingModule();
    service = jasmine.createSpyObj<CompanyService>("CompanyService", ["network", "setModerators", "switchTo", "create"]);
    service.network.and.returnValue(of(payload));

    TestBed.configureTestingModule({
      imports: [SallesComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: CompanyService, useValue: service },
        {
          provide: ConfigurationService,
          useValue: {
            company: () => ({ timezone: "Africa/Tunis", currency: "TND" }),
            subscription: () => subscription,
            proFeatures: () => (subscription as { pro_features?: boolean }).pro_features ?? true,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(SallesComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    reload = spyOn(component as unknown as { reload(path: string): void }, "reload");
    fixture.detectChanges();
  }

  beforeEach(() => build());

  it("draws a card per salle, plus the one that opens another", () => {
    expect(fixture.nativeElement.querySelectorAll(".sl-card").length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll(".sl-card.is-active").length).toBe(1);
  });

  it("names each salle's moderators, and where else they work", () => {
    expect(component.moderatorsOf(component.salles()[0]).map((m) => m.full_name)).toEqual(["Amira", "Karim"]);
    expect(component.salleName("s2")).toBe("Salle Tunis");
  });

  it("says the account's plan covers every salle", () => {
    expect(component.planKey()).toBe("pro");
    expect(component.planNoteKey()).toBe("salles.plan_note");
  });

  // "Mes salles" is Pro's (or the trial's): Starter runs one salle.
  describe("on Starter", () => {
    beforeEach(() => build(network, { plan: "starter", multi_salle: false, pro_features: false }));

    it("locks the whole page with the way to Pro, and never asks for the network", () => {
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector("app-pro-lock")).not.toBeNull();
      expect(el.querySelector(".sl-grid")).toBeNull();
      expect(service.network).not.toHaveBeenCalled();
    });

    it("opens no dialog even when asked", () => {
      component.openCreate();

      expect(component.creating()).toBeFalse();
    });

    it("never switches salle", () => {
      component.switchTo(network.companies[1] as never);
      expect(service.switchTo).not.toHaveBeenCalled();
    });
  });

  it("locks the page on the free trial too: several salles are a paid Pro feature", () => {
    build(network, { plan: null, multi_salle: false, trial: true, pro_features: false });

    expect(fixture.nativeElement.querySelector("app-pro-lock")).not.toBeNull();
    expect(service.network).not.toHaveBeenCalled();
  });

  it("sets the error flag when the network does not load", () => {
    service.network.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBeTrue();
  });

  describe("switching", () => {
    it("moves the session and reloads onto the dashboard", () => {
      service.switchTo.and.returnValue(of({ company: {} }) as never);

      component.switchTo(component.salles()[1]);

      expect(service.switchTo).toHaveBeenCalledWith("s2");
      expect(reload).toHaveBeenCalledWith("/admin/dashboard");
    });

    it("does nothing for the salle already active", () => {
      component.switchTo(component.salles()[0]);
      expect(service.switchTo).not.toHaveBeenCalled();
    });

    it("says so and stays when the switch fails", () => {
      service.switchTo.and.returnValue(throwError(() => new Error("nope")));
      const error = spyOn(toast, "error");

      component.switchTo(component.salles()[1]);

      expect(component.switching()).toBeNull();
      expect(reload).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
    });
  });

  describe("posting moderators", () => {
    it("starts from who works at the salle, and is not dirty until something changes", () => {
      component.openAssign(component.salles()[1]);

      expect([...component.picked()]).toEqual(["m1"]);
      expect(component.assignDirty()).toBeFalse();

      component.toggle("m2");
      expect(component.assignDirty()).toBeTrue();
    });

    it("will not take a moderator off the only salle they work at", () => {
      const sousse = component.salles()[0];
      const karim = component.moderators()[1];

      expect(component.isOnlySalle(karim, sousse)).toBeTrue();
      expect(component.isOnlySalle(component.moderators()[0], sousse)).toBeFalse();

      component.openAssign(sousse);
      fixture.detectChanges();
      const boxes = document.querySelectorAll<HTMLInputElement>(".sl-pick-item input");
      expect(boxes[1].disabled).toBeTrue();
      expect(boxes[0].disabled).toBeFalse();
    });

    it("keeps one moderator per salle: ticking another replaces the first", () => {
      component.openAssign(component.salles()[1]);

      component.toggle("m2");
      expect([...component.picked()]).toEqual(["m2"]);

      component.toggle("m2");
      expect([...component.picked()]).toEqual([]);
    });

    it("adds custom-role logins alongside the moderator", () => {
      component.openAssign(component.salles()[1]);

      component.toggle("m3");
      expect([...component.picked()].sort()).toEqual(["m1", "m3"]);
    });

    it("saves exactly who is ticked, and redraws from the answer", () => {
      const updated: CompanyNetwork = {
        ...network,
        companies: [network.companies[0], { ...network.companies[1], moderator_ids: ["m2"] }],
      };
      service.setModerators.and.returnValue(of(updated));
      const success = spyOn(toast, "success");

      component.openAssign(component.salles()[1]);
      component.toggle("m2");
      component.saveModerators();

      expect(service.setModerators).toHaveBeenCalledWith("s2", ["m2"]);
      expect(component.assigning()).toBeNull();
      expect(component.salles()[1].moderator_ids).toEqual(["m2"]);
      expect(success).toHaveBeenCalled();
    });

    it("keeps the dialog open when the save is refused", () => {
      service.setModerators.and.returnValue(throwError(() => new Error("nope")));
      const error = spyOn(toast, "error");

      component.openAssign(component.salles()[1]);
      component.toggle("m2");
      component.saveModerators();

      expect(component.assigning()).not.toBeNull();
      expect(component.savingModerators()).toBeFalse();
      expect(error).toHaveBeenCalled();
    });

    it("sends nothing when nothing changed", () => {
      component.openAssign(component.salles()[1]);
      component.saveModerators();

      expect(service.setModerators).not.toHaveBeenCalled();
    });

    it("points at the team page when there is nobody to post", () => {
      build({ companies: network.companies.map((c) => ({ ...c, moderator_ids: [] })), moderators: [] });

      component.openAssign(component.salles()[0]);
      fixture.detectChanges();

      expect(document.querySelector("app-modal a[href='/admin/team']")).not.toBeNull();
      expect(document.querySelectorAll(".sl-pick-item").length).toBe(0);
    });
  });

  describe("opening a salle", () => {
    it("will not send without a name", () => {
      component.openCreate();
      component.submitCreate();

      expect(service.create).not.toHaveBeenCalled();
    });

    it("creates it in the active salle's currency and zone, then sets it up", () => {
      service.create.and.returnValue(of({ company: {} }) as never);

      component.openCreate();
      component.form.patchValue({ name: "Salle Monastir", city: "Monastir" });
      component.submitCreate();

      expect(service.create).toHaveBeenCalledWith({
        name: "Salle Monastir",
        city: "Monastir",
        phone: "",
        timezone: "Africa/Tunis",
        currency: "TND",
      });
      expect(reload).toHaveBeenCalledWith("/admin/onboarding");
    });

    it("says a plan refusal in the gym's words", () => {
      service.create.and.returnValue(throwError(() => ({ error: { error: "multi_salle_not_included" } })));

      component.openCreate();
      component.form.patchValue({ name: "X" });
      component.submitCreate();

      expect(component.createError()).toBe("salles.needs_pro_refused");
    });

    it("shows the refusal in the dialog", () => {
      service.create.and.returnValue(throwError(() => ({ error: { error: "Name can't be blank" } })));

      component.openCreate();
      component.form.patchValue({ name: "X" });
      component.submitCreate();

      expect(component.createError()).toBeTruthy();
      expect(component.savingSalle()).toBeFalse();
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
