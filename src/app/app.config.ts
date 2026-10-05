import { HttpClient, provideHttpClient, withInterceptors } from "@angular/common/http";
import { registerLocaleData } from "@angular/common";
import localeAr from "@angular/common/locales/ar";
import localeFr from "@angular/common/locales/fr";
import { ApplicationConfig, ErrorHandler, LOCALE_ID, importProvidersFrom } from "@angular/core";
import { provideRouter, withInMemoryScrolling } from "@angular/router";
import { TranslateLoader, TranslateModule } from "@ngx-translate/core";
import { TranslateHttpLoader } from "@ngx-translate/http-loader";
import { provideNgProgressOptions } from "ngx-progressbar";
import { provideNgProgressRouter } from "ngx-progressbar/router";
import { provideNgProgressHttp, progressInterceptor } from "ngx-progressbar/http";
import * as Sentry from "@sentry/angular";

import { routes } from "./app.routes";
import { jwtInterceptor } from "./core/interceptors/jwt.interceptor";
import { environment } from "../environments/environment";

registerLocaleData(localeFr, "fr");
registerLocaleData(localeAr, "ar");

export function httpLoaderFactory(http: HttpClient): TranslateLoader {
  return new TranslateHttpLoader(http, "assets/i18n/", ".json");
}

// Date/currency pipes read LOCALE_ID once at bootstrap, so this picks up the
// persisted language preference for the initial render. Switching language
// mid-session updates all translated strings live (ngx-translate), but a
// full reload is needed for date-pipe formatting to follow — an accepted V1
// simplification rather than rebuilding Angular's static LOCALE_ID model.
function currentLocaleId(): string {
  const stored = localStorage.getItem("fitora_locale");
  return stored === "en" || stored === "ar" ? stored : "fr";
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: currentLocaleId() },
    // anchorScrolling lets the shared landing header's Fonctionnalités/Comment
    // ça marche/Tarifs links (routerLink="/" + fragment) scroll to the right
    // section even when navigated from a page that isn't the landing page.
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: "enabled", scrollPositionRestoration: "enabled" })),
    provideHttpClient(withInterceptors([jwtInterceptor, progressInterceptor])),
    // Thin top progress bar on route navigation (incl. lazy chunks) and any
    // API request — searches, filters, data loads. i18n asset loads are silent;
    // add an `ignoreProgressBar` header to opt a single request out.
    provideNgProgressOptions({ spinner: false, trickleSpeed: 250, min: 8 }),
    provideNgProgressRouter({ minDuration: 300 }),
    provideNgProgressHttp({ silentApis: ["assets/i18n"] }),
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: httpLoaderFactory,
          deps: [HttpClient],
        },
      })
    ),
    // Only replaces Angular's default ErrorHandler (console.error + swallow)
    // when a DSN is actually configured — no DSN means Sentry.init() in
    // main.ts never ran, so this handler would have nowhere to send to.
    ...(environment.sentryDsn ? [{ provide: ErrorHandler, useValue: Sentry.createErrorHandler() }] : []),
  ],
};
