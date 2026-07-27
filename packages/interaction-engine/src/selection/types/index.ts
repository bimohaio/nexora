import type { InteractionTarget } from "../../types/index.js";

export type SelectionMode =
  "single" | "multi" | "toggle" | "replace" | "add" | "remove" | (string & {});

export type SelectionSource =
  "api" | "pointer" | "keyboard" | "hit-test" | "programmatic" | (string & {});

export interface SelectionRequest {
  readonly targets: readonly InteractionTarget[];
  readonly mode: SelectionMode;
  readonly source: SelectionSource;
  readonly activeTarget?: InteractionTarget;
}

export interface SelectionOverlayState {
  readonly selection: readonly InteractionTarget[];
  readonly primary?: InteractionTarget;
  readonly activeTarget?: InteractionTarget;
}

export interface SelectionOverlayAdapter {
  updateSelectionOverlay(state: Readonly<SelectionOverlayState>): void;
  clearSelectionOverlay(): void;
}

export interface SelectionTargetFilter {
  allowNode?(target: Readonly<InteractionTarget>): boolean;
  allowConnection?(target: Readonly<InteractionTarget>): boolean;
  allowLayer?(layerId: string): boolean;
  allowCustom?(target: Readonly<InteractionTarget>): boolean;
}
