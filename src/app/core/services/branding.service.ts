import { HttpClient } from "@angular/common/http";
import { Injectable, signal } from "@angular/core";
import { API_BASE_URL, API_ORIGIN } from "../models/api-config";

export interface CompanyBranding {
  name: string;
  primary_color: string | null;
  logo_url: string | null;
  // Tenant-wide display settings (Fitora-superadmin managed) — the app language
  // and the currency shown next to amounts.
  locale: string;
  currency: string;
  currency_symbol: string;
}

@Injectable({ providedIn: "root" })
export class BrandingService {
  readonly branding = signal<CompanyBranding | null>(null);

  constructor(private readonly http: HttpClient) {}

  // Called once from the admin/coach shells after login — never from the
  // superadmin shell (a platform superadmin manages many companies, so there's no
  // single brand to apply there) and never from public pages (landing,
  // login, register stay Fitora-branded since no company is known yet).
  // Uses GET /api/v1/branding rather than CompanyService — that endpoint is
  // admin-only, but every staff role needs to see the company's branding.
  // A member belongs to several gyms, so theirs is named explicitly; a staff
  // login has exactly one company and passes nothing.
  load(companyId?: string): void {
    const params = companyId ? { company_id: companyId } : undefined;
    this.http.get<{ branding: CompanyBranding }>(`${API_BASE_URL}/branding`, { params }).subscribe({
      next: (res) => this.apply(res.branding),
      error: () => {
        // Keep default Fitora branding if this fails for any reason —
        // never leave the shell without a usable header.
      },
    });
  }

  logoUrl(branding: CompanyBranding | null = this.branding()): string | null {
    return branding?.logo_url ? `${API_ORIGIN}${branding.logo_url}` : null;
  }

  apply(branding: CompanyBranding): void {
    this.branding.set(branding);
    // The tab title stays "Fitora" (set statically in index.html) — the shell
    // header and title are Fitora-branded regardless of the company. The
    // company name still travels in `branding` for documents / the mobile app.

    if (!branding.primary_color) return;

    // Only --color-primary is a real override; hover/soft are derived from
    // it with color-mix() rather than requiring the company to pick three
    // colors. Mixing toward --color-text (dark in light mode, light in dark
    // mode) makes "hover" correctly go darker in light mode and lighter in
    // dark mode, matching how the default theme's own hover tokens behave.
    const root = document.documentElement;
    root.style.setProperty("--color-primary", branding.primary_color);
    root.style.setProperty("--color-primary-hover", `color-mix(in srgb, ${branding.primary_color} 80%, var(--color-text))`);
    root.style.setProperty("--color-primary-soft", `color-mix(in srgb, ${branding.primary_color} 15%, var(--color-surface))`);
  }
}
