import {
  interpolateAngle,
  interpolateColor,
  interpolateDiscrete,
  interpolateInteger,
  interpolateNumber,
  interpolateOpacity,
  interpolateTransform,
  interpolateVector2,
  type RgbaColor,
  type TransformValue,
  type Vector2Value
} from "./interpolation.js";
import type {
  AnimationPrimitive,
  PrimitiveConfiguration,
  PrimitiveDiagnostic,
  PrimitiveId,
  PrimitiveMetadata
} from "./primitive-contracts.js";
import { AnimationPrimitiveRegistry, asPrimitiveId } from "./primitive-registry.js";

export const BUILT_IN_PRIMITIVE_IDS = Object.freeze({
  scalar: asPrimitiveId("animation.scalar"),
  boolean: asPrimitiveId("animation.boolean"),
  integer: asPrimitiveId("animation.integer"),
  opacity: asPrimitiveId("animation.opacity"),
  color: asPrimitiveId("animation.color"),
  rotation: asPrimitiveId("animation.rotation"),
  translation: asPrimitiveId("animation.translation"),
  scale: asPrimitiveId("animation.scale"),
  transform: asPrimitiveId("animation.transform"),
  keyframe: asPrimitiveId("animation.keyframe")
});

const diagnostic = (message: string): readonly PrimitiveDiagnostic[] => [
  {
    code: "INVALID_VALUE",
    severity: "error",
    message,
    recoverable: false,
    context: Object.freeze({})
  }
];

class BuiltInPrimitive<T> implements AnimationPrimitive<T> {
  public constructor(
    public readonly id: PrimitiveId,
    private readonly evaluator: (from: Readonly<T>, to: Readonly<T>, progress: number) => T,
    private readonly validator: (value: Readonly<T>) => boolean = () => true
  ) {}

  public validate(
    configuration: Readonly<PrimitiveConfiguration<T>>
  ): readonly PrimitiveDiagnostic[] {
    return this.validator(configuration.from) && this.validator(configuration.to)
      ? []
      : diagnostic(`Primitive '${this.id}' received incompatible endpoints.`);
  }

  public evaluate(context: {
    readonly configuration: Readonly<PrimitiveConfiguration<T>>;
    readonly directedProgress: number;
  }): T {
    return this.evaluator(
      context.configuration.from,
      context.configuration.to,
      context.directedProgress
    );
  }
}

const finite = (value: Readonly<number>): boolean => Number.isFinite(value);
const integer = (value: Readonly<number>): boolean => Number.isInteger(value);
const vector = (value: Readonly<Vector2Value>): boolean =>
  typeof value === "object" && Number.isFinite(value.x) && Number.isFinite(value.y);
const color = (value: Readonly<RgbaColor>): boolean =>
  typeof value === "object" && [value.r, value.g, value.b, value.a].every(Number.isFinite);
const transform = (value: Readonly<TransformValue>): boolean =>
  // Runtime guard intentionally remains defensive although TransformValue marks both fields required.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  typeof value === "object" && value.translation !== undefined && value.scale !== undefined;

const metadata = (id: PrimitiveId, displayName: string): PrimitiveMetadata => ({
  id,
  displayName,
  description: `${displayName} renderer-neutral primitive.`,
  version: "1.0.0",
  engineCompatibility: ">=0.0.0",
  supportedDirections: ["normal", "reverse", "alternate", "alternate-reverse"],
  supportedFillModes: ["none", "forwards", "backwards", "both"],
  supportedInterpolations: ["linear", "ease-in", "ease-out", "ease-in-out", "step", "discrete"]
});

export function createBuiltInAnimationPrimitiveRegistry(): AnimationPrimitiveRegistry {
  const registry = new AnimationPrimitiveRegistry();
  const register = <T>(
    id: PrimitiveId,
    displayName: string,
    factory: () => AnimationPrimitive<T>
  ): void => {
    registry.register({ metadata: metadata(id, displayName), factory });
  };
  register(
    BUILT_IN_PRIMITIVE_IDS.scalar,
    "Scalar",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.scalar, interpolateNumber, finite)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.boolean,
    "Boolean",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.boolean, interpolateDiscrete)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.integer,
    "Integer",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.integer, interpolateInteger, integer)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.opacity,
    "Opacity",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.opacity, interpolateOpacity, finite)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.color,
    "Color",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.color, interpolateColor, color)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.rotation,
    "Rotation",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.rotation, interpolateAngle, finite)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.translation,
    "Translation",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.translation, interpolateVector2, vector)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.scale,
    "Scale",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.scale, interpolateVector2, vector)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.transform,
    "Transform",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.transform, interpolateTransform, transform)
  );
  register(
    BUILT_IN_PRIMITIVE_IDS.keyframe,
    "Keyframe",
    () => new BuiltInPrimitive(BUILT_IN_PRIMITIVE_IDS.keyframe, interpolateDiscrete)
  );
  return registry;
}
