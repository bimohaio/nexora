import { expect, test } from "@playwright/test";

test("runtime engine streams targeted visual state and supports viewer controls", async ({
  page
}) => {
  await page.goto("/");
  const svg = page.locator("[data-scada-root]");
  await expect(svg).toBeVisible();
  await expect(page.locator('[data-entity-type="node"]')).toHaveCount(18);
  await expect(page.locator('[data-entity-type="connection"][data-hit-area="true"]')).toHaveCount(
    8
  );

  const status = page.locator("#viewport-status");
  const initialStatus = await status.textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(status).not.toHaveText(initialStatus ?? "");

  await page.getByRole("button", { name: "Fit" }).click();
  await expect(page.locator("#runtime-status")).toHaveText("RUNNING");
  await expect(page.locator("#tag-status")).toContainText("18 / 18 tags");
  await page.getByRole("button", { name: "Toggle alarm" }).click();
  await expect(
    page.locator('[data-entity-type="node"][data-node-id="node_feed_pump"]')
  ).toHaveClass(/scada-state-alarm/);
  await expect(page.locator('[data-connection-id="conn_pump_mixer"]').first()).toHaveAttribute(
    "stroke",
    "#ef4444"
  );
  await page.getByRole("button", { name: "Disable pump" }).click();
  await expect(page.locator('[data-node-id="node_feed_pump"]').first()).toHaveClass(
    /scada-state-disabled/
  );
  await page.getByRole("button", { name: "Enable pump" }).click();

  await page.getByRole("button", { name: "Ports" }).click();
  await expect(page.locator('[data-entity-type="port"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Grid" }).click();
  await expect(page.locator("[data-scada-grid]")).toBeEmpty();
});

test("runtime foundation exposes revision, pause, reset, and resume", async ({ page }) => {
  await page.goto("/");
  const tagStatus = page.locator("#tag-status");
  await expect(tagStatus).toContainText("18 / 18 tags");
  await expect(tagStatus).toContainText(/revision [1-9]/);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  const pausedStatus = await tagStatus.textContent();
  await page.waitForTimeout(900);
  await expect(tagStatus).toHaveText(pausedStatus ?? "");

  await page.getByRole("button", { name: "Reset runtime" }).click();
  await expect(tagStatus).toContainText("0 / 18 tags");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(tagStatus).toContainText("18 / 18 tags");
});

test("runtime engine exposes disconnect, offline quality, and reconnect lifecycle", async ({
  page
}) => {
  await page.goto("/");
  await expect(page.locator("#runtime-status")).toHaveText("RUNNING");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.locator("#runtime-status")).toHaveText("RECONNECTING");
  await expect(page.locator('[data-node-id="node_feed_pump"]').first()).toHaveClass(
    /scada-state-offline/
  );
  await expect(page.locator("#diagnostic-status")).toContainText("PROVIDER_RECONNECT_SCHEDULED");

  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(page.locator("#runtime-status")).toHaveText("RUNNING");
  await expect(page.locator('[data-node-id="node_feed_pump"]').first()).toHaveClass(
    /scada-state-running/
  );
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
