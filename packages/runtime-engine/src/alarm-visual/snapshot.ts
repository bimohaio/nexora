import type {
  ResolvedConnectionVisualState,
  ResolvedNodeVisualState,
  RuntimeVisualSnapshot
} from "../contracts.js";
import type { AlarmVisualSnapshot } from "./types.js";

/** Attaches resolved presentation to the standard immutable renderer snapshot. */
export function composeAlarmPresentationSnapshot(
  visual: RuntimeVisualSnapshot,
  alarms: AlarmVisualSnapshot
): RuntimeVisualSnapshot {
  const nodes = new Map<string, ResolvedNodeVisualState>();
  for (const [id, state] of visual.nodes) {
    const alarmPresentation = alarms.symbols.get(id);
    nodes.set(
      id,
      alarmPresentation === undefined ? state : Object.freeze({ ...state, alarmPresentation })
    );
  }
  const connections = new Map<string, ResolvedConnectionVisualState>();
  for (const [id, state] of visual.connections) {
    const alarmPresentation = alarms.connections.get(id);
    connections.set(
      id,
      alarmPresentation === undefined ? state : Object.freeze({ ...state, alarmPresentation })
    );
  }
  return Object.freeze({
    ...visual,
    revision: Math.max(visual.revision, alarms.revision),
    timestamp: Math.max(visual.timestamp, alarms.timestamp),
    nodes,
    connections,
    alarmVisualSnapshot: alarms,
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
