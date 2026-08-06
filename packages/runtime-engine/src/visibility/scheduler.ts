import type {
  RuntimeVisibilitySnapshot,
  RuntimeVisibilityUpdate,
  VisibilitySchedulerTarget
} from "./types.js";

export class VisibilitySchedulerAdapter {
  #lastMotion: RuntimeVisibilitySnapshot["motionPolicy"] | undefined;
  public constructor(private readonly target: VisibilitySchedulerTarget) {}
  public apply(update: RuntimeVisibilityUpdate): void {
    if (!update.changed || update.diff === undefined) return;
    const snapshot = update.snapshot;
    if (snapshot.motionPolicy !== this.#lastMotion) {
      this.target.setReducedMotion(
        snapshot.motionPolicy === "full-motion" || snapshot.motionPolicy === "diagnostic-mode"
          ? "no-preference"
          : "reduce"
      );
      this.#lastMotion = snapshot.motionPolicy;
    }
    for (const entityId of update.diff.changedEntityIds) {
      const entry = snapshot.entries.get(entityId);
      if (entry !== undefined)
        this.target.setEntityVisibility(
          entityId,
          entry.permission.scheduler === "run" ? "visible" : "offscreen"
        );
    }
  }
}
