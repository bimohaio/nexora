import type {
  ResolvedConnectionVisualState,
  ResolvedNodeVisualState,
  RuntimeVisualSnapshot
} from "../contracts.js";
import type { OverlaySnapshot } from "./types.js";

export function composeOverlaySnapshot(
  visual: RuntimeVisualSnapshot,
  overlays: OverlaySnapshot
): RuntimeVisualSnapshot {
  const nodes = new Map<string, ResolvedNodeVisualState>();
  for (const [id, state] of visual.nodes) {
    const alarmOverlays = overlays.symbols.get(id);
    nodes.set(id, alarmOverlays === undefined ? state : Object.freeze({ ...state, alarmOverlays }));
  }
  const connections = new Map<string, ResolvedConnectionVisualState>();
  for (const [id, state] of visual.connections) {
    const alarmOverlays = overlays.connections.get(id);
    connections.set(
      id,
      alarmOverlays === undefined ? state : Object.freeze({ ...state, alarmOverlays })
    );
  }
  return Object.freeze({
    ...visual,
    revision: Math.max(visual.revision, overlays.revision),
    timestamp: Math.max(visual.timestamp, overlays.timestamp),
    nodes,
    connections,
    overlaySnapshot: overlays,
    getNodeState: visual.getNodeState.bind(visual),
    ...(visual.getNodeVisualState === undefined
      ? {}
      : { getNodeVisualState: visual.getNodeVisualState.bind(visual) }),
    getNodeProperties: visual.getNodeProperties.bind(visual),
    getNodeVisibility: visual.getNodeVisibility.bind(visual),
    getNodeQuality: visual.getNodeQuality.bind(visual),
    getConnectionStyle: visual.getConnectionStyle.bind(visual),
    getConnectionVisibility: visual.getConnectionVisibility.bind(visual),
    getConnectionQuality: visual.getConnectionQuality.bind(visual)
  });
}
