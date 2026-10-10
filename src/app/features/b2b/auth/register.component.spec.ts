import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { AuthService } from "../../../core/auth/auth.service";
import { LocaleService } from "../../../core/services/locale.service";
import { RegisterComponent } from "./register.component";

describe("RegisterComponent", () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let auth: { register: jasmine.Spy };
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    auth = { register: jasmine.createSpy("register").and.returnValue(of({ token: "t", user: {} })) };

    TestBed.configureTestingModule({
      imports: [RegisterComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: LocaleService, useValue: { locale: () => "fr" } },
      ],
    });

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, "navigateByUrl");
    fixture.detectChanges();
  });

  function fill(): void {
    component.form.setValue({
      first_name: "Amine",
      last_name: "Mghirbi",
      email: "amine@gym.test",
      password: "password123",
    });
  }

  it("does nothing until the form is filled in", () => {
    component.submit();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it("refuses a password too short to be one", () => {
    fill();
    component.form.controls.password.setValue("short");
    component.submit();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it("registers with the reader's own language", () => {
    fill();
    component.submit();

    expect(auth.register).toHaveBeenCalledWith({
      first_name: "Amine",
      last_name: "Mghirbi",
      email: "amine@gym.test",
      password: "password123",
      locale: "fr",
    });
  });

  // Nothing past sign-up opens until the address is confirmed: the next
  // screen waits for the click, then hands over to naming the gym.
  it("sends them to confirm their address, not straight to naming their gym", () => {
    fill();
    component.submit();

    expect(router.navigateByUrl).toHaveBeenCalledWith("/confirmation-email");
  });

  it("stays put and says why when the address is already taken", () => {
    auth.register.and.returnValue(throwError(() => new Error("taken")));
    fill();
    component.submit();

    expect(component.error()).toBeTruthy();
    expect(component.loading()).toBe(false);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it("pre-fills the first name and e-mail the landing page handed over", () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RegisterComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: LocaleService, useValue: { locale: () => "fr" } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ first_name: "Sarah", email: "sarah@studio.tn" }) } } },
      ],
    });
    const prefilled = TestBed.createComponent(RegisterComponent).componentInstance;
    expect(prefilled.form.getRawValue()).toEqual(jasmine.objectContaining({ first_name: "Sarah", email: "sarah@studio.tn", last_name: "" }));
  });
});
