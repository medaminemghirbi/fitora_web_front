import { Injectable, signal } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";

export type Locale = "fr" | "en" | "ar";

// Shared by every language picker (landing header, superadmin shell) so the list
// and its native labels live in one place.
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
];

const LOCALE_KEY = "fitora_locale";
const RTL_LOCALES: Locale[] = ["ar"];
const SUPPORTED_LOCALES: Locale[] = ["fr", "en", "ar"];
const DEFAULT_LOCALE: Locale = "fr";

@Injectable({ providedIn: "root" })
export class LocaleService {
  readonly locale = signal<Locale>(DEFAULT_LOCALE);

  constructor(private readonly translate: TranslateService) {
    this.translate.addLangs(SUPPORTED_LOCALES);
    this.translate.setDefaultLang(DEFAULT_LOCALE);
    this.setLocale(this.readStoredLocale());
  }

  // Switches translated strings and RTL/dir instantly. Angular's LOCALE_ID
  // (used by DatePipe/CurrencyPipe) is fixed at bootstrap from the persisted
  // preference, so date formatting reflects whichever language the app was
  // *loaded* in — an accepted V1 simplification instead of forcing a reload
  // (or rebuilding Angular's static LOCALE_ID model) on every language switch.
  setLocale(locale: Locale): void {
    this.locale.set(locale);
    localStorage.setItem(LOCALE_KEY, locale);
    this.translate.use(locale);

    const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", locale);
  }

  // Inside a company's app the language is a tenant-wide setting delivered in
  // the bootstrap payload (a Fitora superadmin controls it) — there is no per-user
  // switch. Called by ConfigurationService whenever /bootstrap lands.
  applyCompanyLocale(locale: string | null | undefined): void {
    if (locale && SUPPORTED_LOCALES.includes(locale as Locale) && locale !== this.locale()) {
      this.setLocale(locale as Locale);
    }
  }

  isRtl(): boolean {
    return RTL_LOCALES.includes(this.locale());
  }

  private readStoredLocale(): Locale {
    const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
    return stored && SUPPORTED_LOCALES.includes(stored) ? stored : DEFAULT_LOCALE;
  }
}
