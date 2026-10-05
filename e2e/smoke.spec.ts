import { expect, test } from "@playwright/test";
import { seeded, signIn, t } from "./fixtures";

// In order: each journey leaves the gym the way the next one expects it.
test.describe.serial("Fitora smoke", () => {
  test("an admin signs in and lands on their dashboard", async ({ page }) => {
    const { admin } = seeded();

    await signIn(page, admin.email, admin.password);

    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("the admin adds a walk-in member", async ({ page }) => {
    const { admin } = seeded();
    await signIn(page, admin.email, admin.password);

    await page.goto("/admin/clients");
    await page.getByRole("button", { name: t("clients.new") }).first().click();
    await page.locator("#cl-first").fill("Walid");
    await page.locator("#cl-last").fill("Walkin");
    await page.locator("#cl-phone").fill("+216 20 222 222");
    await page.getByRole("button", { name: t("common.next") }).click();
    await page.getByRole("button", { name: t("clients.finish_without_plan") }).click();

    await expect(page.getByText("Walid Walkin").first()).toBeVisible();
  });

  test("a member accepts their invitation, signs in and books a class", async ({ page }) => {
    const { member, gym } = seeded();
    const password = "member-password-1";

    await page.goto(`/auth/accept-invitation?token=${member.invitation_token}`);
    await expect(page.getByRole("heading", { name: t("auth.invitation_title") })).toBeVisible();
    await page.locator("#password").fill(password);
    await page.locator("#password_confirmation").fill(password);
    await page.getByRole("button", { name: t("auth.invitation_submit") }).click();
    await expect(page.getByRole("heading", { name: t("auth.invitation_done_title") })).toBeVisible();

    await signIn(page, member.email, password);
    await expect(page).toHaveURL(/\/member\/home/);

    // Tomorrow's class, in the list of the days ahead.
    await expect(page.getByText(gym.activity).first()).toBeVisible();
    await page.getByRole("button", { name: t("member.book") }).first().click();
    await expect(page.getByText(t("member.booked")).first()).toBeVisible();

    await page.goto("/member/bookings");
    await expect(page.getByText(gym.activity).first()).toBeVisible();
  });

  test("the admin bundles two activities into a pack, prices it and sells it", async ({ page }) => {
    const { admin, gym } = seeded();
    await signIn(page, admin.email, admin.password);

    // A pack needs a second discipline.
    await page.goto("/admin/catalogue?tab=activites");
    await page.getByRole("button", { name: t("activities.new") }).first().click();
    await page.locator("#act-name").fill("Boxe");
    await page.getByRole("button", { name: t("common.save") }).click();
    await expect(page.locator(".act-item", { hasText: "Boxe" })).toBeVisible();

    await page.getByRole("tab", { name: t("catalogue.tab_packs") }).click();
    await page.getByRole("button", { name: t("packs.new") }).first().click();
    await page.locator("#pk-name").fill("Duo");
    await page.getByRole("button", { name: gym.activity, exact: true }).click();
    await page.getByRole("button", { name: "Boxe", exact: true }).click();
    await page.locator("input[id^='pk-price-']").first().fill("150");
    await page.getByRole("button", { name: t("common.save") }).click();
    await expect(page.locator(".pk-card", { hasText: "Duo" })).toContainText("150");

    // On the tariff grid, where a price is changed where it stands.
    await page.getByRole("tab", { name: t("catalogue.tab_prices") }).click();
    const cell = page.getByLabel(`Duo — ${gym.plan}`);
    await expect(cell).toHaveValue("150");
    await cell.fill("140");
    await cell.press("Enter");
    await expect(page.locator(".pg-cell.is-saved")).toBeVisible();

    // And at the desk: a new member, sold the pack.
    await page.goto("/admin/clients");
    await page.getByRole("button", { name: t("clients.new") }).first().click();
    await page.locator("#cl-first").fill("Dalia");
    await page.locator("#cl-last").fill("Duo");
    await page.locator("#cl-phone").fill("+216 20 333 333");
    await page.getByRole("button", { name: t("common.next") }).click();
    await page.locator("#cl-activity").selectOption({ label: `Duo (Boxe + ${gym.activity})` });
    await page.locator("#cl-plan").selectOption({ label: gym.plan });
    await page.getByRole("button", { name: t("common.next") }).click();
    await page.getByRole("button", { name: t("clients.finish") }).click();

    await expect(page.getByText("Dalia Duo").first()).toBeVisible();
  });

    test("the admin changes their password and signs in with the new one", async ({ page }) => {
    const { admin } = seeded();
    const next = "admin-password-2";
    await signIn(page, admin.email, admin.password);

    await page.goto("/admin/settings/account");
    await page.locator("#cp-current").fill(admin.password);
    await page.locator("#cp-new").fill(next);
    await page.locator("#cp-confirm").fill(next);
    await page.getByRole("button", { name: t("account.change_password") }).click();
    await expect(page.getByText(t("account.password_changed"))).toBeVisible();

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await signIn(page, admin.email, next);
    await expect(page).toHaveURL(/\/admin\//);
  });
});
