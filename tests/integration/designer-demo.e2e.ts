import { expect, test } from "@playwright/test";

test("designer selects, deletes, and restores a node through command history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Nexora Designer", { exact: true })).toBeVisible();

  const tank = page.locator('[data-node-id="node_tank"]').first();
  await expect(tank).toBeVisible();
  await tank.click();
  await expect(page.locator('[data-resize-handle="nw"]')).toBeVisible();

  await page.keyboard.press("Delete");
  await expect(page.locator('[data-node-id="node_tank"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-node-id="node_tank"]').first()).toBeVisible();
});
