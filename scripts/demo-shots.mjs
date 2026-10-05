// Screenshots of Studio Lumen (backend: rails demo:seed) for the client demo
// guide. Expects the demo API on :3100 and `ng serve --configuration e2e
// --port 4300`. Writes PNGs to the directory given as the first argument.
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "demo-shots";
const APP = "http://localhost:4300";
const backend = new URL("../../backend/tmp/", import.meta.url).pathname;
const logins = JSON.parse(readFileSync(join(backend, "demo.json"), "utf8"));
const ids = JSON.parse(readFileSync(join(backend, "demo_ids.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function session(viewport, who) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: "fr-FR", timezoneId: "Africa/Tunis" });
  const page = await context.newPage();
  await page.goto(`${APP}/connexion`);
  await page.locator("#email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 20_000 });
  return { context, page };
}

async function shot(page, name, { path, wait, before, fullPage = false, clip } = {}) {
  if (path) await page.goto(`${APP}${path}`);
  if (wait) await page.locator(wait).first().waitFor({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  if (before) await before(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage, clip });
  console.log("shot", name);
}

const desk = { width: 1440, height: 900 };

// ---- the manager ----------------------------------------------------------
{
  const { context, page } = await session(desk, logins.admin);
  await shot(page, "08-dashboard", { path: "/admin/dashboard", wait: "app-page-header, h1" });
  await shot(page, "01-settings-booking", { path: "/admin/settings/booking", wait: "#sb-reminder", fullPage: true });
  await shot(page, "02-catalogue-prices", { path: "/admin/catalogue", wait: "app-price-grid" });
  await shot(page, "02-catalogue-plans", {
    path: "/admin/catalogue?tab=formules", wait: ".plan-chip",
    before: async (p) => {
      await p.locator(".app-card, article, li, div").filter({ hasText: "Carnet EMS 10 séances" }).getByRole("button", { name: /Modifier/ }).last().click();
      await p.locator("#mp-validity").waitFor();
    },
  });
  await page.keyboard.press("Escape");
  await shot(page, "03-calendar-week", { path: "/admin/calendar", wait: ".fx-ev" });
  await shot(page, "03-calendar-new-slot", {
    before: async (p) => {
      await p.getByRole("button", { name: /Nouvelle séance|séance/i }).first().click();
      await p.locator("#cs-activity").selectOption({ label: "⚡ EMS (25 min)" });
      await p.locator("#cs-space").selectOption({ label: "Cabine EMS 1" }).catch(() => {});
      await p.locator("#cs-repeat").check().catch(() => {});
    },
  });
  await page.keyboard.press("Escape");
  await shot(page, "04-prospect-profile", { path: `/admin/clients/${ids.Chiraz}`, wait: ".prof-banner" });
  await shot(page, "04-trial-booking", {
    before: async (p) => {
      await p.getByRole("button", { name: /réservation/i }).first().click();
      await p.locator("#bk-activity").selectOption({ label: "⚡ EMS" });
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      await p.locator("#bk-date").fill(tomorrow);
      await p.waitForTimeout(1000);
      const options = await p.locator("#bk-session option:not([disabled])").all();
      if (options.length) await p.locator("#bk-session").selectOption({ index: 1 });
    },
  });
  await page.keyboard.press("Escape");
  await shot(page, "04-health-file", {
    path: `/admin/clients/${ids.Salma}`, wait: ".prof-health",
    before: async (p) => {
      await p.locator(".prof-health button").click();
      await p.locator("#hl-notes").waitFor();
    },
  });
  await page.keyboard.press("Escape");
  await shot(page, "05-member-profile", { path: `/admin/clients/${ids.Salma}`, wait: ".prof-health" });
  await shot(page, "05-contracts", { path: "/admin/contracts", wait: "table" });
  await shot(page, "05-paused-profile", { path: `/admin/clients/${ids.Hela}`, wait: ".prof-banner" });
  await shot(page, "05-payments", { path: "/admin/payments", wait: "table" });
  await context.close();
}

// ---- the member's own app (phone size) -------------------------------------
{
  const { context, page } = await session({ width: 390, height: 844 }, logins.member);
  await shot(page, "06-member-schedule", { path: "/member/home", wait: ".mb-slot" });
  await shot(page, "06-member-bookings", { path: "/member/bookings", wait: "h1" });
  await shot(page, "06-member-profile", { path: "/member/profile", wait: "h1" });
  await context.close();
}

// ---- the coach, on their phone ----------------------------------------------
{
  const { context, page } = await session({ width: 390, height: 844 }, logins.coach);
  await shot(page, "07-coach-today", { path: "/coach/today", wait: "h1, h2" });
  await shot(page, "07-coach-members", { path: "/coach/members", wait: ".coach-member" });
  await context.close();
}

await browser.close();
