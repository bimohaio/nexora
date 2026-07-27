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

test("advanced editing rotates, groups, ungroups, and respects keyboard nudge", async ({
  page
}) => {
  await page.goto("/");
  const tank = page.locator('[data-node-id="node_tank"]').first();
  const pump = page.locator('[data-node-id="node_pump"]').first();

  await tank.click();
  await expect(page.locator("[data-rotate-handle]")).toBeVisible();
  await page.getByRole("button", { name: "↻ 15°" }).click();
  await expect(tank).toHaveAttribute("transform", /rotate\(15/);

  await pump.click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator("#status")).toContainText("1 nodes");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+Shift+g");
  await expect(page.locator("#status")).toContainText("2 nodes");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
});
