import type { AnimationAuthoringMetadata } from "@web-scada/animation-engine";
import type { AlarmVisualAuthoringMetadata } from "@web-scada/alarm-visualization";

/** Shared metadata source for future Phase 10 authoring UI. */
export interface Phase10AuthoringCatalog {
  readonly animations: readonly AnimationAuthoringMetadata[];
  readonly alarms: AlarmVisualAuthoringMetadata;
}
