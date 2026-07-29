import { describe, expect, it, vi } from "vitest";
import {
  BrowserDocumentVisibilitySource,
  BrowserReducedMotionSource
} from "./browser-policy-adapters.js";
import { BrowserAnimationFrameDriver } from "./frame-drivers.js";

describe("animation browser adapters", () => {
  it("fails explicitly when RAF is unavailable", () => {
    const driver = new BrowserAnimationFrameDriver({});
    expect(() => driver.request(() => undefined)).toThrow(/unavailable/);
    expect(() => {
      driver.cancel(1);
    }).toThrow(/unavailable/);
  });

  it("delegates request and cancellation through the injected host", () => {
    const callback = vi.fn();
    const requestAnimationFrame = vi.fn((_handler: (timestamp: number) => void) => 7);
    const cancelAnimationFrame = vi.fn();
    const driver = new BrowserAnimationFrameDriver({
      requestAnimationFrame,
      cancelAnimationFrame
    });
    expect(driver.request(callback)).toBe(7);
    driver.cancel(7);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });

  it("owns and disposes one reduced-motion listener", () => {
    let listener: ((event: { readonly matches: boolean }) => void) | undefined;
    const remove = vi.fn();
    const query = {
      matches: false,
      addEventListener: (
        _type: "change",
        next: (event: { readonly matches: boolean }) => void
      ): void => {
        listener = next;
      },
      removeEventListener: remove
    };
    const source = new BrowserReducedMotionSource({ matchMedia: () => query });
    const values: string[] = [];
    source.subscribe((value) => values.push(value));
    listener?.({ matches: true });
    source.dispose();
    source.dispose();
    expect(values).toEqual(["reduce"]);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("normalizes document visibility and removes its listener", () => {
    let listener: (() => void) | undefined;
    const remove = vi.fn();
    const host = {
      visibilityState: "visible",
      addEventListener: (_type: "visibilitychange", next: () => void): void => {
        listener = next;
      },
      removeEventListener: remove
    };
    const source = new BrowserDocumentVisibilitySource(host);
    const values: boolean[] = [];
    source.subscribe((value) => values.push(value));
    Object.assign(host, { visibilityState: "hidden" });
    listener?.();
    source.dispose();
    expect(values).toEqual([true]);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
