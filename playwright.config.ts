import { defineConfig, devices } from "@playwright/test";

/**
 * The smoke suite: the handful of journeys that have to work for Fitora to
 * be usable at all, driven through a real browser against a real Rails API.
 * The unit specs prove components; these prove the product — the Bootstrap
 * removal broke four screens that every unit spec still passed.
 *
 *   npm run e2e
 *
 * Both servers are started here, on their own ports and their own database
 * (backend_e2e), which the Rails side resets and seeds before it boots
 * (backend/lib/tasks/e2e.rake).
 */
const BACKEND = "../backend";
const API = "http://localhost:3100";
const APP = "http://localhost:4300";

export default defineConfig({
  testDir: "./e2e",
  // One gym, one set of fixtures: the journeys run in order, not side by side.
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  use: {
    baseURL: APP,
    locale: "fr-FR",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        `cd ${BACKEND} && export DATABASE_URL=postgres:///backend_e2e DISABLE_RACK_ATTACK=1 ` +
        `FRONTEND_ORIGINS=${APP} FRONTEND_URL=${APP} && ` +
        "bin/rails db:prepare e2e:seed && bin/rails server -p 3100 -P tmp/pids/e2e.pid",
      url: `${API}/up`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "npx ng serve --configuration e2e --port 4300",
      url: APP,
      reuseExistingServer: !process.env["CI"],
      timeout: 240_000,
    },
  ],
});
