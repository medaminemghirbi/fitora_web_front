import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { AuthService } from "../../../core/auth/auth.service";
import { CompanyService } from "../../../core/services/company.service";
import { ActivityTemplatesService } from "../../../core/services/activity-templates.service";
import { ActivityTemplate } from "../../../core/models/activity-template.model";
import { CompanySetupComponent } from "./company-setup.component";

describe("CompanySetupComponent", () => {
  let fixture: ComponentFixture<CompanySetupComponent>;
  let component: CompanySetupComponent;
  let companyService: jasmine.SpyObj<CompanyService>;
  let authStub: { refreshCurrentUser: jasmine.Spy };
  let router: Router;
  let templatesService: jasmine.SpyObj<ActivityTemplatesService>;

  const reformer: ActivityTemplate = {
    id: "t1", key: "pilates_reformer", family: "wellness", emoji: "🌀",
    names: { fr: "Pilates Reformer", en: "Reformer Pilates" }, session_format: "small_group", duration: 50, capacity: 6,
  };

  beforeEach(async () => {
    companyService = jasmine.createSpyObj<CompanyService>("CompanyService", ["create"]);
    templatesService = jasmine.createSpyObj<ActivityTemplatesService>("ActivityTemplatesService", ["list"]);
    templatesService.list.and.returnValue(of({ activity_templates: [reformer] }));
    authStub = { refreshCurrentUser: jasmine.createSpy() };

    await TestBed.configureTestingModule({
      imports: [CompanySetupComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: CompanyService, useValue: companyService },
        { provide: AuthService, useValue: authStub },
        { provide: ActivityTemplatesService, useValue: templatesService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CompanySetupComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, "navigateByUrl");
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it("pre-fills the timezone/country from the detected location", () => {
    expect(component.form.value.timezone).toBeTruthy();
  });

  it("picking a country updates the timezone to that country's main zone", () => {
    component.form.controls.country.setValue("FR");
    expect(component.form.value.timezone).toContain("Paris");
  });

  it("loads the activity catalogue while the first step is filled", () => {
    expect(component.templates()).toEqual([reformer]);
    expect(component.templatesLoading()).toBe(false);
  });

  it("only moves to the activities step once the details hold", () => {
    component.form.reset();
    component.next();
    expect(component.step()).toBe(0);

    component.form.patchValue({ name: "Studio Sousse", timezone: "Africa/Tunis" });
    component.next();
    expect(component.step()).toBe(1);

    component.back();
    expect(component.step()).toBe(0);
  });

  it("opens the salle with the picked templates and the activities it named", fakeAsync(() => {
    component.form.patchValue({ name: "Studio Sousse", timezone: "Africa/Tunis" });
    companyService.create.and.returnValue(of({ company: {} as never }));
    authStub.refreshCurrentUser.and.returnValue(of({} as never));
    component.selectedTemplates.set(["t1"]);
    component.customActivities.set([{ name: "Aerial yoga", emoji: null }]);

    component.submit();
    tick(5000);

    expect(companyService.create).toHaveBeenCalledWith(jasmine.objectContaining({ name: "Studio Sousse" }), {
      activity_template_ids: ["t1"],
      custom_activities: [{ name: "Aerial yoga", emoji: null }],
    });
  }));

  it("opens the salle with no activities when the step is skipped", fakeAsync(() => {
    component.form.patchValue({ name: "Studio Sousse", timezone: "Africa/Tunis" });
    companyService.create.and.returnValue(of({ company: {} as never }));
    authStub.refreshCurrentUser.and.returnValue(of({} as never));
    component.selectedTemplates.set(["t1"]);

    component.submit(true);
    tick(5000);

    expect(companyService.create).toHaveBeenCalledWith(jasmine.any(Object), {});
  }));

  it("still lets the salle open when the catalogue cannot be loaded", () => {
    templatesService.list.and.returnValue(throwError(() => new Error("down")));
    component.ngOnInit();

    expect(component.templatesFailed()).toBe(true);
    expect(component.templatesLoading()).toBe(false);
  });

  it("submit does nothing with an invalid form", () => {
    component.form.reset();
    component.submit();
    expect(companyService.create).not.toHaveBeenCalled();
  });

  it("submit creates the company, refreshes the user, and redirects after the prep animation", fakeAsync(() => {
    component.form.patchValue({ name: "Acme Gym", timezone: "Africa/Tunis" });
    companyService.create.and.returnValue(of({ company: {} as never }));
    authStub.refreshCurrentUser.and.returnValue(of({} as never));

    component.submit();
    expect(component.preparing()).toBe(true);
    expect(component.saving()).toBe(true);

    tick(5000);

    expect(component.preparing()).toBe(false);
    expect(component.saving()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith("/admin/getting-started");
  }));

  it("submit still redirects even if refreshing the user fails", fakeAsync(() => {
    component.form.patchValue({ name: "Acme Gym", timezone: "Africa/Tunis" });
    companyService.create.and.returnValue(of({ company: {} as never }));
    authStub.refreshCurrentUser.and.returnValue(throwError(() => new Error("nope")));

    component.submit();
    tick(5000);

    expect(router.navigateByUrl).toHaveBeenCalledWith("/admin/getting-started");
  }));

  it("submit stops preparing and shows the backend error on create failure", fakeAsync(() => {
    component.form.patchValue({ name: "Acme Gym", timezone: "Africa/Tunis" });
    companyService.create.and.returnValue(throwError(() => new Error("nope")));

    component.submit();
    tick(0);

    expect(component.preparing()).toBe(false);
    expect(component.saving()).toBe(false);
    expect(component.error()).toBeTruthy();
  }));

  it("the prep step advances over time while preparing", fakeAsync(() => {
    component.form.patchValue({ name: "Acme Gym", timezone: "Africa/Tunis" });
    companyService.create.and.returnValue(of({ company: {} as never }));
    authStub.refreshCurrentUser.and.returnValue(of({} as never));

    component.submit();
    expect(component.prepStep()).toBe(0);
    tick(1250);
    expect(component.prepStep()).toBeGreaterThan(0);

    tick(5000);
  }));

  it("ngOnDestroy clears the prep timer without throwing", fakeAsync(() => {
    component.form.patchValue({ name: "Acme Gym", timezone: "Africa/Tunis" });
    companyService.create.and.returnValue(of({ company: {} as never }));
    authStub.refreshCurrentUser.and.returnValue(of({} as never));
    component.submit();

    expect(() => fixture.destroy()).not.toThrow();
    tick(5000);
  }));
});
