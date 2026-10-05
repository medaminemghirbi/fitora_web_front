import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { API_ORIGIN } from "../../../core/models/api-config";
import { Company } from "../../../core/models/company.model";
import { BrandingService } from "../../../core/services/branding.service";
import { CompanyService } from "../../../core/services/company.service";
import { ToastService } from "../../../core/services/toast.service";
import { SettingsBrandingComponent } from "./settings-branding.component";

describe("SettingsBrandingComponent", () => {
  let fixture: ComponentFixture<SettingsBrandingComponent>;
  let component: SettingsBrandingComponent;
  let companyService: jasmine.SpyObj<CompanyService>;
  let brandingService: jasmine.SpyObj<BrandingService>;
  let toast: ToastService;

  const company = { slug: "acme", primary_color: "#ff0000", logo_url: "/logos/acme.png" } as Company;

  beforeEach(async () => {
    companyService = jasmine.createSpyObj<CompanyService>("CompanyService", ["get", "updateBranding"]);
    brandingService = jasmine.createSpyObj<BrandingService>("BrandingService", ["load"]);
    companyService.get.and.returnValue(of({ company }));

    await TestBed.configureTestingModule({
      imports: [SettingsBrandingComponent, TranslateModule.forRoot()],
      providers: [
        { provide: CompanyService, useValue: companyService },
        { provide: BrandingService, useValue: brandingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsBrandingComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it("loads the company's branding on init", () => {
    expect(component.form.value.slug).toBe("acme");
    expect(component.logoUrl()).toBe(`${API_ORIGIN}/logos/acme.png`);
    expect(component.loading()).toBe(false);
  });

  it("falls back to defaults when the company has no slug/color/logo yet", () => {
    companyService.get.and.returnValue(of({ company: { slug: null, primary_color: null, logo_url: null } as unknown as Company }));
    fixture = TestBed.createComponent(SettingsBrandingComponent);
    fixture.detectChanges();
    const fresh = fixture.componentInstance;
    expect(fresh.form.value.slug).toBe("");
    expect(fresh.form.value.primary_color).toBe("#4a2a8f");
    expect(fresh.logoUrl()).toBeNull();
  });

  it("stops loading even when the fetch fails", () => {
    companyService.get.and.returnValue(throwError(() => new Error("nope")));
    fixture = TestBed.createComponent(SettingsBrandingComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it("onLogoSelected previews the chosen file", (done) => {
    const file = new File(["x"], "logo.png", { type: "image/png" });
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [file] });

    component.onLogoSelected({ target: input } as unknown as Event);
    expect(component.selectedLogo()).toBe(file);

    setTimeout(() => {
      expect(component.logoPreview()).toBeTruthy();
      done();
    }, 50);
  });

  it("onLogoSelected clears the preview when no file is chosen", () => {
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [] });
    component.onLogoSelected({ target: input } as unknown as Event);
    expect(component.selectedLogo()).toBeNull();
    expect(component.logoPreview()).toBeNull();
  });

  it("submit saves the branding, refreshes the shell, and shows a success toast", () => {
    companyService.updateBranding.and.returnValue(of({ company: { ...company, logo_url: "/logos/new.png" } }));
    component.submit();
    expect(component.saving()).toBe(false);
    expect(component.logoUrl()).toBe(`${API_ORIGIN}/logos/new.png`);
    expect(brandingService.load).toHaveBeenCalled();
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("submit sends null for a blank slug/color, and null when the saved logo is cleared", () => {
    component.form.patchValue({ slug: "", primary_color: "" });
    companyService.updateBranding.and.returnValue(of({ company: { ...company, logo_url: null } }));
    component.submit();
    expect(companyService.updateBranding).toHaveBeenCalledWith(jasmine.objectContaining({ slug: null, primary_color: null, logo: null }));
    expect(component.logoUrl()).toBeNull();
  });

  it("submit shows the backend error on failure", () => {
    companyService.updateBranding.and.returnValue(throwError(() => new Error("nope")));
    component.submit();
    expect(component.formError()).toBeTruthy();
  });

  describe("what contracts are signed with", () => {
    it("loads the signature, the signatory and the terms", () => {
      companyService.get.and.returnValue(of({
        company: { ...company, signature_url: "/sig.png", signatory_name: "Sami, gérant", contract_terms: "Serviette obligatoire." },
      }));
      component.ngOnInit();

      expect(component.signatureUrl()).toBe(`${API_ORIGIN}/sig.png`);
      expect(component.form.value.signatory_name).toBe("Sami, gérant");
      expect(component.form.value.contract_terms).toBe("Serviette obligatoire.");
    });

    it("refuses a signature the PDF could not print", () => {
      const input = document.createElement("input");
      const file = new File(["x"], "sig.webp", { type: "image/webp" });
      Object.defineProperty(input, "files", { value: [file] });

      component.onSignatureSelected({ target: input } as unknown as Event);

      expect(component.signatureError()).toBeTruthy();
      expect(component.selectedSignature()).toBeNull();
    });

    it("sends a new signature with the signatory and the terms", () => {
      const input = document.createElement("input");
      const file = new File(["x"], "sig.png", { type: "image/png" });
      Object.defineProperty(input, "files", { value: [file] });
      component.onSignatureSelected({ target: input } as unknown as Event);
      component.form.patchValue({ signatory_name: " Sami ", contract_terms: "" });
      companyService.updateBranding.and.returnValue(of({ company: { ...company, signature_url: "/sig.png" } }));

      component.submit();

      expect(companyService.updateBranding).toHaveBeenCalledWith(jasmine.objectContaining({
        signature: file, remove_signature: false, signatory_name: "Sami", contract_terms: "",
      }));
      expect(component.signatureUrl()).toBe(`${API_ORIGIN}/sig.png`);
      expect(component.selectedSignature()).toBeNull();
    });

    it("is signed on the pad by default, and keeps what was drawn to send", (done) => {
      expect(component.signatureMode()).toBe("draw");
      const drawn = new File(["x"], "signature.png", { type: "image/png" });

      component.onSignatureDrawn(drawn);

      expect(component.selectedSignature()).toBe(drawn);
      setTimeout(() => {
        expect(component.signaturePreview()).toContain("data:image/png");
        done();
      }, 50);
    });

    it("forgets the drawing when the pad is cleared", () => {
      component.onSignatureDrawn(new File(["x"], "signature.png", { type: "image/png" }));
      component.onSignatureDrawn(null);

      expect(component.selectedSignature()).toBeNull();
      expect(component.signaturePreview()).toBeNull();
    });

    it("takes the saved signature off", () => {
      component.signatureUrl.set("/sig.png");
      component.clearSignature();
      companyService.updateBranding.and.returnValue(of({ company: { ...company, signature_url: null } }));

      component.submit();

      expect(companyService.updateBranding).toHaveBeenCalledWith(jasmine.objectContaining({ remove_signature: true }));
      expect(component.signatureUrl()).toBeNull();
    });
  });
});

