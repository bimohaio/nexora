import { expect, test } from "@playwright/test";

test("runtime viewer loads and supports viewer navigation controls", async ({ page }) => {
  await page.goto("/");
  const svg = page.locator("[data-scada-root]");
  await expect(svg).toBeVisible();
  await expect(page.locator('[data-entity-type="node"]')).toHaveCount(8);
  await expect(page.locator('[data-entity-type="connection"][data-hit-area="true"]')).toHaveCount(
    3
  );

  const status = page.locator("#viewport-status");
  const initialStatus = await status.textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(status).not.toHaveText(initialStatus ?? "");

  await page.getByRole("button", { name: "Fit" }).click();
  await page.getByRole("button", { name: "Pump state" }).click();
  await expect(page.locator('[data-entity-type="node"][data-node-id="node_pump"]')).toHaveClass(
    /scada-state-alarm/
  );

  await page.getByRole("button", { name: "Ports" }).click();
  await expect(page.locator('[data-entity-type="port"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Grid" }).click();
  await expect(page.locator("[data-scada-grid]")).toBeEmpty();
});

test("runtime viewer pans and resizes its SVG viewport", async ({ page }) => {
  await page.goto("/");
  const viewer = page.locator("#viewer");
  const box = await viewer.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  const status = page.locator("#viewport-status");
  const before = await status.textContent();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 80);
  await page.mouse.up();
  await expect(status).not.toHaveText(before ?? "");

  await page.setViewportSize({ width: 1100, height: 700 });
  await expect(page.locator("[data-scada-root]")).toHaveAttribute("width", /\d+/);
  await expect(page.locator("[data-scada-root]")).toHaveAttribute("height", /\d+/);
});
