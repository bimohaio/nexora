import type {
  ResolvedConnectionVisualState,
  ResolvedNodeVisualState,
  RuntimeVisualSnapshot
} from "../contracts.js";
import type { RuntimeVisibilitySnapshot } from "./types.js";

/** Attaches renderer-neutral visibility hints without changing renderer ownership. */
export function composeVisibilitySnapshot(
  visual: RuntimeVisualSnapshot,
  visibility: RuntimeVisibilitySnapshot
): RuntimeVisualSnapshot {
  const nodes = new Map<string, ResolvedNodeVisualState>();
  for (const [id, state] of visual.nodes) {
    const visibilityOptimization = visibility.entries.get(id);
    nodes.set(
      id,
      visibilityOptimization === undefined
        ? state
        : Object.freeze({ ...state, visibilityOptimization })
    );
  }
  const connections = new Map<string, ResolvedConnectionVisualState>();
  for (const [id, state] of visual.connections) {
    const visibilityOptimization = visibility.entries.get(id);
    connections.set(
      id,
      visibilityOptimization === undefined
        ? state
        : Object.freeze({ ...state, visibilityOptimization })
    );
  }
  return Object.freeze({
    ...visual,
    revision: Math.max(visual.revision, visibility.revision),
    timestamp: Math.max(visual.timestamp, visibility.timestamp),
    nodes,
    connections,
    visibilitySnapshot: visibility,
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
