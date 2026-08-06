import { describe, expect, it } from "vitest";
import type { AlarmPresentation, AlarmVisualSnapshot } from "../alarm-visual/types.js";
import {
  AlarmOverlayStore,
  resolveAcknowledgementOverlay,
  resolveOverlayPriority,
  resolveOverlayStack,
  resolveWarning,
  type OverlayLayer
} from "./index.js";

function presentation(overrides: Partial<AlarmPresentation> = {}): AlarmPresentation {
  return {
    scope: "symbol",
    entityId: "s-1",
    revision: 1,
    effectiveSeverity: "high",
    effectiveStatus: "Active",
    acknowledged: false,
    badge: { kind: "triangle", token: "alarm.high.badge" },
    overlay: { kind: "outline", token: "alarm.high.overlay" },
    border: { kind: "severity", token: "alarm.high.stroke", thickness: 2, emphasized: true },
    fill: { token: "alarm.high.fill", opacity: 0.9, gradientRequest: false, textureRequest: false },
    icon: { kind: "alarm", token: "alarm.high.icon" },
    text: {
      colorToken: "alarm.high.text",
      weight: "medium",
      blink: true,
      underline: true,
      outline: false,
      contrastBoost: true
    },
    animation: { requests: ["blink", "pulse"], reducedMotion: false, staticFallback: false },
    decoration: { labelEmphasis: "strong" },
    communicationLoss: false,
    flowInterrupted: false,
    criticalHighlight: false,
    warningOverlay: true,
    ...overrides
  };
}
function snapshot(
  symbols: ReadonlyMap<string, AlarmPresentation>,
  revision = 1
): AlarmVisualSnapshot {
  const document = presentation({ scope: "document", entityId: "document" });
  return {
    revision,
    alarmRevision: revision,
    timestamp: revision,
    themeId: "default",
    motionPreference: "no-preference",
    symbols,
    connections: new Map(),
    groups: new Map(),
    layers: new Map(),
    document
  };
}

describe("alarm overlay resolution", () => {
  it("resolves acknowledgement and warning contracts with semantic tokens", () => {
    const p = presentation();
    expect(resolveAcknowledgementOverlay(p)).toMatchObject({
      acknowledged: false,
      pulseRequested: true,
      highlighted: true,
      badge: { layer: { token: "overlay.unacknowledged.badge" } }
    });
    expect(resolveWarning(p)).toMatchObject({
      glowRequested: true,
      iconToken: "overlay.process-warning.icon"
    });
    expect(JSON.stringify(resolveOverlayStack({ presentation: p }))).not.toMatch(/#|rgb|svg|css/i);
  });
  it("uses deterministic priority, duplicate removal and maximum count", () => {
    const p = presentation({ effectiveSeverity: "emergency", criticalHighlight: true });
    const duplicate: OverlayLayer = {
      id: "custom",
      type: "custom",
      kind: "icon",
      placement: "center",
      priority: 100,
      token: "overlay.custom.icon",
      visible: true,
      motion: [],
      tooltip: {
        title: "custom",
        description: "custom",
        severity: "high",
        acknowledgementState: "unacknowledged"
      }
    };
    const stack = resolveOverlayStack({
      presentation: p,
      customLayers: [duplicate, duplicate],
      maximumCount: 3
    });
    expect(stack.layers).toHaveLength(3);
    expect(stack.layers[0]?.priority).toBeGreaterThanOrEqual(stack.layers[1]?.priority ?? 0);
    expect(new Set(stack.layers.map(({ id }) => id)).size).toBe(stack.layers.length);
    expect(stack.truncated).toBe(true);
    expect(resolveOverlayPriority("emergency")).toBeGreaterThan(
      resolveOverlayPriority("acknowledged")
    );
  });
  it("removes motion but preserves static overlays under reduced motion", () => {
    const stack = resolveOverlayStack({
      presentation: presentation({ effectiveSeverity: "critical", criticalHighlight: true }),
      motionPreference: "reduce"
    });
    expect(stack.layers.length).toBeGreaterThan(0);
    expect(stack.layers.every(({ motion }) => motion.length === 0)).toBe(true);
    expect(stack.warning?.glowRequested).toBe(false);
  });
  it("maps operational and connection states", () => {
    expect(
      resolveOverlayStack({
        presentation: presentation({ effectiveStatus: "Offline", communicationLoss: true })
      }).layers.some(({ type }) => type === "offline")
    ).toBe(true);
    expect(
      resolveOverlayStack({
        presentation: presentation({
          scope: "connection",
          flowInterrupted: true,
          communicationLoss: true
        })
      }).layers.some(({ type }) => type === "communication-lost")
    ).toBe(true);
  });
  it("updates only changed IDs and reprojects theme, motion and enable policy", () => {
    const store = new AlarmOverlayStore();
    const initial = snapshot(
      new Map([
        ["s-1", presentation()],
        ["s-2", presentation({ entityId: "s-2" })]
      ])
    );
    store.apply(initial);
    const stable = store.snapshot.symbols.get("s-2");
    const changed = snapshot(
      new Map([
        ["s-1", presentation({ acknowledged: true })],
        ["s-2", presentation({ entityId: "s-2" })]
      ]),
      2
    );
    const update = store.apply(changed, {
      fromRevision: 1,
      toRevision: 2,
      changedSymbolIds: ["s-1"],
      changedConnectionIds: [],
      changedGroupIds: [],
      changedLayerIds: [],
      documentChanged: false,
      reason: "alarm"
    });
    expect(update.diff?.changedSymbolIds).toEqual(["s-1"]);
    expect(update.snapshot.symbols.get("s-2")).toBe(stable);
    expect(
      store.setTheme({ id: "night", tokens: { "overlay.acknowledged.badge": "theme.night.ack" } })
        .snapshot.presentationRevision
    ).toBe(2);
    expect(
      store
        .setMotionPreference("reduce")
        .snapshot.symbols.get("s-1")
        ?.layers.every(({ motion }) => motion.length === 0)
    ).toBe(true);
    expect(store.setEnabled(false).snapshot.symbols.get("s-1")?.layers).toEqual([]);
  });
  it("projects 10,000 overlays across 5,000 symbols deterministically", () => {
    const presentations = new Map<string, AlarmPresentation>();
    for (let index = 0; index < 5_000; index += 1)
      presentations.set(
        `s-${index}`,
        presentation({
          entityId: `s-${index}`,
          effectiveSeverity: index % 10 === 0 ? "critical" : "high",
          criticalHighlight: index % 10 === 0
        })
      );
    const store = new AlarmOverlayStore();
    const result = store.apply(snapshot(presentations));
    expect(result.snapshot.symbols.size).toBe(5_000);
    expect(
      [...result.snapshot.symbols.values()].reduce((count, stack) => count + stack.layers.length, 0)
    ).toBeGreaterThanOrEqual(10_000);
  });
});
