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

test("phase 9 showcase exposes manager diagnostics, bounded values, and quality recovery", async ({
  page
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Validated · schema 1.0.0 · 18 nodes")).toBeVisible();
  await expect(page.locator("#datasource-diagnostics")).toContainText("browser-simulator");
  await expect(page.locator("#datasource-diagnostics")).toContainText("connected");
  await expect(page.locator("#datasource-diagnostics")).toContainText("1");
  await expect(page.locator("#runtime-values tr")).toHaveCount(18);

  await page.getByRole("button", { name: "Bad quality" }).click();
  await expect(page.getByRole("button", { name: "Restore good quality" })).toBeVisible();
  await expect(page.locator('#runtime-values tr[data-quality="bad"]')).toHaveCount(18);
  await page.getByRole("button", { name: "Restore good quality" }).click();
  await expect(page.locator('#runtime-values tr[data-quality="good"]')).toHaveCount(18);
  expect(browserErrors).toEqual([]);
});

test("designer mode selects entities without changing the persisted sample", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Designer" }).click();
  await expect(page.locator("#mode-status")).toHaveText("Designer mode");
  await page.locator('[data-node-id="node_feed_pump"]').first().click();
  await expect(page.locator("#entity-inspector")).toContainText("P-101 Feed Pump");
  await expect(page.locator("#entity-inspector")).toContainText("process.centrifugal-pump");

  await page.getByRole("button", { name: "Runtime", exact: true }).click();
  await expect(page.locator("#runtime-status")).toHaveText("RUNNING");
  await expect(page.locator('[data-node-id="node_feed_pump"]').first()).toBeVisible();
});

test("external datasource choices degrade to configuration guidance", async ({ page }) => {
  await page.goto("/");
  await page.locator("#datasource-select").selectOption("modbus");
  await expect(page.locator("#adapter-config")).toContainText("Raw Modbus TCP is unavailable");
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeDisabled();
  await page.locator("#datasource-select").selectOption("opcua");
  await expect(page.locator("#adapter-config")).toContainText("requires Node.js/backend");
  await page.locator("#datasource-select").selectOption("simulator");
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeEnabled();
});

test("two browser demo instances keep datasource and viewport state isolated", async ({ page }) => {
  const second = await page.context().newPage();
  await Promise.all([page.goto("/"), second.goto("/")]);
  await expect(page.locator("#runtime-status")).toHaveText("RUNNING");
  await expect(second.locator("#runtime-status")).toHaveText("RUNNING");

  const secondViewport = await second.locator("#viewport-status").textContent();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(second.locator("#viewport-status")).toHaveText(secondViewport ?? "");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.locator("#runtime-status")).toHaveText("RECONNECTING");
  await expect(second.locator("#runtime-status")).toHaveText("RUNNING");

  await page.close();
  await expect(second.locator("#runtime-values tr")).toHaveCount(18);
  await second.close();
});

test("showcase remains usable at supported desktop and tablet viewports", async ({ page }) => {
  await page.goto("/");
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 }
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("heading", { name: "Water Treatment Control Center" })
    ).toBeVisible();
    await expect(page.locator("[data-scada-root]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Runtime", exact: true })).toBeVisible();
    await expect(page.locator("#datasource-diagnostics")).toBeVisible();
  }
});
