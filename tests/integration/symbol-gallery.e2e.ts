import { expect, test } from "@playwright/test";

test("symbol gallery renders the complete catalog and preview controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Industrial Symbol Library" })).toBeVisible();
  await expect(page.locator("article[data-symbol-type]")).toHaveCount(50);
  await expect(page.locator("[data-category]")).toHaveCount(14);
  await expect(page.locator("[data-scada-root]")).toHaveCount(50);

  await page.getByLabel("Runtime state").selectOption("alarm");
  await expect(page.locator(".scada-state-alarm").first()).toBeVisible();

  await page.getByRole("button", { name: "Show minimum sizes" }).click();
  await expect(page.getByRole("button", { name: "Show default sizes" })).toBeVisible();
  await expect(page.locator("[data-scada-symbol]")).toHaveCount(50);
});
