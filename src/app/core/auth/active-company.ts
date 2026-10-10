/**
 * The salle this browser tab is working in, sent as `X-Company-Id` on every
 * API request (see jwtInterceptor and the backend's
 * ApplicationController#apply_company_header!).
 *
 * sessionStorage, so each tab keeps its own: switching salle in one tab no
 * longer redirects what another tab is in the middle of writing. This is a
 * preference, never a permission — the backend checks it against the
 * login's own salles on every request and refuses anything else.
 *
 * Storage can throw (private windows, blocked site data); the tab then
 * simply sends no header and follows the account's saved salle.
 */
const KEY = "fitora_company_id";

export const activeCompany = {
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },

  set(id: string | null | undefined): void {
    try {
      if (id) sessionStorage.setItem(KEY, id);
      else sessionStorage.removeItem(KEY);
    } catch {
      // No storage: no header, which is the old behaviour.
    }
  },
};
