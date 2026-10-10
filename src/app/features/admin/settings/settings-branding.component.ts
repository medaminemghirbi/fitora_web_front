import { Component, Input, OnInit, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { API_ORIGIN } from "../../../core/models/api-config";
import { BrandingService } from "../../../core/services/branding.service";
import { CompanyService } from "../../../core/services/company.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { SignaturePadComponent } from "../../../shared/ui/signature-pad.component";
import { ProLockComponent } from "../../../shared/ui/pro-lock.component";
import { ConfigurationService } from "../../../core/configuration/configuration.service";

@Component({
  selector: "app-settings-branding",
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, SpinnerComponent, SignaturePadComponent, ProLockComponent],
  templateUrl: "./settings-branding.component.html",
  styleUrl: "./settings-branding.component.scss",
})
export class SettingsBrandingComponent implements OnInit {
  /**
   * Which half to show. Settings splits them into two tabs: "brand" (logo,
   * colour, identifier — a Pro tool) and "contracts" (signature, signatory,
   * terms — every plan's). One form underneath, so either half saves the
   * other untouched.
   */
  @Input() part: "all" | "brand" | "contracts" = "all";

  get showBrand(): boolean {
    return this.part !== "contracts";
  }

  get showContracts(): boolean {
    return this.part !== "brand";
  }

  /**
   * The gym's own look (logo, colour, identifier) is a Pro tool. On Starter
   * that part is locked; the contract part below it is every plan's.
   */
  readonly proFeatures = inject(ConfigurationService).proFeatures;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly logoUrl = signal<string | null>(null);
  readonly logoPreview = signal<string | null>(null);
  readonly selectedLogo = signal<File | null>(null);

  // What every contract PDF is signed with: an image of the signature, who
  // signs, and the gym's own clauses (empty prints Fitora's defaults).
  readonly signatureUrl = signal<string | null>(null);
  readonly signaturePreview = signal<string | null>(null);
  readonly selectedSignature = signal<File | null>(null);
  readonly removeSignature = signal(false);
  readonly signatureError = signal<string | null>(null);
  /** Signed on the pad by default; an image file is the alternative. */
  readonly signatureMode = signal<"draw" | "upload">("draw");

  readonly form = this.fb.nonNullable.group({
    slug: [""],
    primary_color: ["#4a2a8f"],
    signatory_name: [""],
    contract_terms: [""],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly companyService: CompanyService,
    private readonly branding: BrandingService,
    private readonly toast: ToastService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.companyService.get().subscribe({
      next: (res) => {
        const company = res.company;
        this.form.patchValue({
          slug: company.slug || "",
          primary_color: company.primary_color || "#4a2a8f",
          signatory_name: company.signatory_name || "",
          contract_terms: company.contract_terms || "",
        });
        this.logoUrl.set(company.logo_url ? `${API_ORIGIN}${company.logo_url}` : null);
        this.signatureUrl.set(company.signature_url ? `${API_ORIGIN}${company.signature_url}` : null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedLogo.set(file);

    if (!file) {
      this.logoPreview.set(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  onSignatureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.signatureError.set(null);

    // PNG or JPEG only — what a PDF can embed. Refused here rather than
    // after the upload, with the reason.
    if (file && !["image/png", "image/jpeg"].includes(file.type)) {
      this.signatureError.set(this.translate.instant("settings.signature_type_error"));
      input.value = "";
      return;
    }

    this.selectedSignature.set(file);
    this.removeSignature.set(false);
    if (!file) {
      this.signaturePreview.set(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.signaturePreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  /** A stroke finished on the pad (or the pad was cleared: null). */
  onSignatureDrawn(file: File | null): void {
    this.signatureError.set(null);
    this.selectedSignature.set(file);
    this.removeSignature.set(false);
    if (!file) {
      this.signaturePreview.set(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.signaturePreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  clearSignature(): void {
    this.selectedSignature.set(null);
    this.signaturePreview.set(null);
    this.removeSignature.set(!!this.signatureUrl());
  }

  submit(): void {
    this.saving.set(true);
    this.formError.set(null);

    const raw = this.form.getRawValue();
    this.companyService
      .updateBranding({
        slug: raw.slug || null,
        primary_color: raw.primary_color || null,
        logo: this.selectedLogo(),
        signature: this.selectedSignature(),
        remove_signature: this.removeSignature(),
        signatory_name: raw.signatory_name.trim(),
        contract_terms: raw.contract_terms.trim(),
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.selectedLogo.set(null);
          this.logoPreview.set(null);
          this.logoUrl.set(res.company.logo_url ? `${API_ORIGIN}${res.company.logo_url}` : null);
          this.selectedSignature.set(null);
          this.signaturePreview.set(null);
          this.removeSignature.set(false);
          this.signatureUrl.set(res.company.signature_url ? `${API_ORIGIN}${res.company.signature_url}` : null);
          this.toast.success(this.translate.instant("common.save"));
          // Refresh the shell's header immediately rather than waiting for
          // a reload — the name/logo/color just changed underneath it.
          this.branding.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }
}
