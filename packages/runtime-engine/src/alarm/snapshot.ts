import type {
  ResolvedConnectionVisualState,
  ResolvedNodeVisualState,
  RuntimeVisualSnapshot
} from "../contracts.js";
import type { AlarmSnapshot } from "./types.js";

/**
 * Additively composes alarm aggregates into a visual snapshot without mutating either source.
 * Renderers can consume the standard node/connection maps and never evaluate alarm rules.
 */
export function composeAlarmVisualSnapshot(
  visual: RuntimeVisualSnapshot,
  alarms: AlarmSnapshot
): RuntimeVisualSnapshot {
  const nodes = new Map<string, ResolvedNodeVisualState>();
  for (const [id, state] of visual.nodes) {
    const alarmState = alarms.symbols.get(id);
    nodes.set(id, alarmState === undefined ? state : Object.freeze({ ...state, alarmState }));
  }
  const connections = new Map<string, ResolvedConnectionVisualState>();
  for (const [id, state] of visual.connections) {
    const alarmState = alarms.connections.get(id);
    connections.set(id, alarmState === undefined ? state : Object.freeze({ ...state, alarmState }));
  }
  return Object.freeze({
    ...visual,
    revision: Math.max(visual.revision, alarms.revision),
    timestamp: Math.max(visual.timestamp, alarms.timestamp),
    nodes,
    connections,
    alarmSnapshot: alarms,
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
