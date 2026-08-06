import type { SymbolAnimationBindingInput } from "@web-scada/runtime-engine";

export const SYMBOL_ANIMATION_BINDING_PARAMETERS = [
  "enabled",
  "speed",
  "direction",
  "duration",
  "opacity",
  "color",
  "level",
  "flow"
] as const;

export type SymbolAnimationBindingParameter = (typeof SYMBOL_ANIMATION_BINDING_PARAMETERS)[number];

export interface AnimationBindingOutput {
  readonly entityId: string;
  readonly target: string;
  readonly value: unknown;
  readonly quality: string;
}

export interface AnimationBindingAdapterResult {
  readonly input?: SymbolAnimationBindingInput;
  readonly diagnostics: readonly {
    readonly code: "ANIMATION_BINDING_TARGET_INVALID" | "ANIMATION_BINDING_QUALITY_REJECTED";
    readonly message: string;
  }[];
}

/**
 * Converts resolved Binding Engine output into the Runtime Engine animation boundary. Supported
 * targets are `animation.<slot>.<parameter>` and legacy direct parameter names.
 */
export function toSymbolAnimationBindingInput(
  output: Readonly<AnimationBindingOutput>
): AnimationBindingAdapterResult {
  if (["bad", "offline", "unknown"].includes(output.quality))
    return {
      diagnostics: [
        {
          code: "ANIMATION_BINDING_QUALITY_REJECTED",
          message: `Animation binding quality '${output.quality}' is not usable.`
        }
      ]
    };
  const segments = output.target.split(".");
  const direct = SYMBOL_ANIMATION_BINDING_PARAMETERS.find(
    (parameter) => parameter === output.target
  );
  const parameter =
    direct ??
    (segments.length === 3 && segments[0] === "animation"
      ? SYMBOL_ANIMATION_BINDING_PARAMETERS.find((candidate) => candidate === segments[2])
      : undefined);
  if (parameter === undefined)
    return {
      diagnostics: [
        {
          code: "ANIMATION_BINDING_TARGET_INVALID",
          message: `Animation binding target '${output.target}' is invalid.`
        }
      ]
    };
  const slotId = direct === undefined ? segments[1] : undefined;
  return {
    input: {
      entityId: output.entityId,
      parameter,
      value: output.value,
      ...(slotId === undefined ? {} : { slotId })
    },
    diagnostics: []
  };
}
