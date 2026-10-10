import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, throwError } from "rxjs";
import { AuthService } from "../auth/auth.service";
import { activeCompany } from "../auth/active-company";

// Set while a refused salle is being forgotten, so the burst of 403s a page
// load produces starts one recovery, not one per request.
let recoveringCompany = false;

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();
  // The salle this tab works in (see active-company.ts) — the backend
  // re-checks it against the login's own salles on every request.
  const companyId = token ? activeCompany.get() : null;

  const authorizedReq = token
    ? req.clone({
        setHeaders: { Authorization: `Bearer ${token}`, ...(companyId ? { "X-Company-Id": companyId } : {}) },
      })
    : req;

  return next(authorizedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && auth.isAuthenticated()) {
        auth.logout();
        router.navigate(["/connexion"]);
      }

      // 402 is the lock signal from Api::V1::BaseController
      // #enforce_trial_lock!, whatever closed the door — an expired trial, a
      // month left unpaid, a suspension. Any of them lands on the same page,
      // rather than leaving a half-loaded screen behind the rejected request.
      if (error.status === 402 && !router.url.startsWith("/account-locked")) {
        router.navigate(["/account-locked"]);
      }

      // An admin whose address is not confirmed yet reaches nothing past
      // sign-up (BaseController#require_confirmed_email!). The guards
      // normally keep them on the waiting screen; this catches a stale tab.
      // This tab's salle is no longer one the login works in (taken off
      // it, or the post deactivated). Forget it, ask the server which salle
      // the account opens on now (no header this time, so it answers with
      // the saved one and the cached user stops naming the refused salle),
      // then start over: nothing loaded so far belongs to it.
      if (error.status === 403 && error.error?.error === "company_not_accessible" && !recoveringCompany) {
        recoveringCompany = true;
        activeCompany.set(null);
        const restart = () => window.location.assign("/");
        auth.fetchCurrentUser().subscribe({ next: restart, error: restart });
      }

      if (error.status === 403 && error.error?.error === "email_unverified" && !router.url.startsWith("/confirmation-email")) {
        router.navigate(["/confirmation-email"]);
      }

      return throwError(() => error);
    })
  );
};
