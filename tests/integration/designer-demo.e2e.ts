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

test("designer visually authors and maintains bindings", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-node-id="node_tank"]').first().click();
  const panel = page.getByRole("region", { name: "Data bindings" });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-binding-id="binding_tank_level"]')).toContainText(
    "plant.cooling.level"
  );
  await expect(panel).toContainText("Definition valid");

  await panel.getByRole("button", { name: "Pause" }).click();
  await expect(panel.locator('[data-binding-id="binding_tank_level"]')).toContainText("PAUSED");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(panel.locator('[data-binding-id="binding_tank_level"]')).toContainText("ACTIVE");

  await panel.getByRole("button", { name: "Duplicate" }).click();
  await expect(panel.locator(".binding-card")).toHaveCount(2);
  await panel.getByRole("button", { name: "Delete" }).last().click();
  await expect(panel.locator(".binding-card")).toHaveCount(1);

  await panel.getByRole("button", { name: "Create binding" }).click();
  await expect(panel.locator(".binding-card")).toHaveCount(2);
  await expect(page.locator("#binding-form-status")).toContainText("Binding created");
});

test("arrow keys nudge the selected node without grid snapping", async ({ page }) => {
  await page.goto("/");
  const tank = page.locator('[data-node-id="node_tank"]').first();
  await tank.click();
  const x = page.locator('#node-inspector input[name="x"]');
  const y = page.locator('#node-inspector input[name="y"]');
  await expect(x).toHaveValue("120");
  await expect(y).toHaveValue("180");

  await page.keyboard.press("ArrowRight");
  await expect(x).toHaveValue("121");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(y).toHaveValue("190");
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

test("designer exposes semantic accessibility state and preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/");
  const root = page.locator("[data-scada-root]");
  await expect(root).toHaveAttribute("role", "graphics-document");
  await expect(root).toHaveAttribute("data-high-contrast", "");
  await expect(root).toHaveAttribute("data-reduced-motion", "");

  const tank = page.locator('[data-node-id="node_tank"]').first();
  await expect(tank).toHaveAttribute("role", "graphics-symbol");
  await expect(tank).toHaveAttribute("aria-label", /tank/i);
  await tank.click();
  await expect(tank).toHaveAttribute("aria-selected", "true");
  await expect(tank).toHaveAttribute("data-accessibility-focused", "");
  await expect(page.locator('[aria-live="polite"]')).toContainText("1 nodes");
});

test("designer remains responsive under coalescible interaction bursts", async ({ page }) => {
  await page.goto("/");
  const tank = page.locator('[data-node-id="node_tank"]').first();
  await tank.click();
  const elapsed = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLElement>("#designer-canvas");
    if (canvas === null) throw new Error("Designer canvas is missing.");
    const started = performance.now();
    for (let index = 0; index < 1_000; index += 1)
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: index % 500,
          clientY: index % 300,
          bubbles: true
        })
      );
    for (let index = 0; index < 100; index += 1)
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    for (let index = 0; index < 100; index += 1)
      canvas.dispatchEvent(
        new WheelEvent("wheel", { deltaY: index % 2 === 0 ? -1 : 1, bubbles: true })
      );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resolve();
        })
      );
    });
    return performance.now() - started;
  });
  expect(elapsed).toBeLessThan(2_000);
  await expect(page.locator("#viewport-status")).toContainText("%");
});
