import type { ResolvedPhase10VisualState } from "@web-scada/alarm-visualization";

/**
 * Apply-only Phase 10 boundary. Implementations map semantic state to SVG
 * incrementally; they do not evaluate conditions, bindings or severity.
 */
export interface SvgPhase10VisualAdapter {
  apply(update: ResolvedPhase10VisualState): void;
  remove(entityId: string): void;
  dispose(): void;
}
