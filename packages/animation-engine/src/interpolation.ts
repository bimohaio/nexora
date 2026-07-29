import { AnimationValidationError } from "./errors.js";
import type { PrimitiveInterpolationId } from "./primitive-contracts.js";

export interface Interpolator<T> {
  readonly id: PrimitiveInterpolationId;
  interpolate(from: Readonly<T>, to: Readonly<T>, progress: number): T;
}

export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface Vector2Value {
  readonly x: number;
  readonly y: number;
}

export interface Vector3Value extends Vector2Value {
  readonly z: number;
}

export interface Matrix2DValue {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export interface TransformValue {
  readonly translation: Vector2Value;
  readonly rotationDeg: number;
  readonly scale: Vector2Value;
  readonly skew: Vector2Value;
  readonly order: readonly ["translation", "rotation", "skew", "scale"];
}

export type AngleDirection = "direct" | "shortest" | "clockwise" | "counter-clockwise";

const finite = (value: number, name: string): number => {
  if (!Number.isFinite(value))
    throw new AnimationValidationError(`${name} must be finite.`, {
      code: "INVALID_VALUE"
    });
  return value;
};

export const clampProgress = (progress: number): number =>
  Math.min(1, Math.max(0, finite(progress, "Progress")));

export const linear = (progress: number): number => clampProgress(progress);
export const easeIn = (progress: number): number => {
  const value = clampProgress(progress);
  return value * value;
};
export const easeOut = (progress: number): number => {
  const value = clampProgress(progress);
  return 1 - (1 - value) * (1 - value);
};
export const easeInOut = (progress: number): number => {
  const value = clampProgress(progress);
  return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
};
export const step = (progress: number, steps = 1): number => {
  if (!Number.isInteger(steps) || steps <= 0)
    throw new AnimationValidationError("Step count must be a positive integer.", {
      code: "INVALID_CONFIGURATION"
    });
  const value = clampProgress(progress);
  return value === 1 ? 1 : Math.floor(value * steps) / steps;
};

export function interpolateNumber(from: number, to: number, progress: number): number {
  finite(from, "From");
  finite(to, "To");
  const value = clampProgress(progress);
  if (value === 0) return from;
  if (value === 1) return to;
  return finite(from + (to - from) * value, "Interpolated result");
}

export function interpolateInteger(from: number, to: number, progress: number): number {
  if (!Number.isInteger(from) || !Number.isInteger(to))
    throw new AnimationValidationError("Integer endpoints must be integers.", {
      code: "INVALID_VALUE"
    });
  const value = interpolateNumber(from, to, progress);
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function interpolateDiscrete<T>(from: T, to: T, progress: number, threshold = 0.5): T {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new AnimationValidationError("Discrete threshold must be between zero and one.", {
      code: "INVALID_CONFIGURATION"
    });
  return clampProgress(progress) < threshold ? from : to;
}

export const interpolateOpacity = (from: number, to: number, progress: number): number =>
  Math.min(1, Math.max(0, interpolateNumber(from, to, progress)));

function validateColor(color: Readonly<RgbaColor>): void {
  for (const [name, value, maximum] of [
    ["r", color.r, 255],
    ["g", color.g, 255],
    ["b", color.b, 255],
    ["a", color.a, 1]
  ] as const)
    if (!Number.isFinite(value) || value < 0 || value > maximum)
      throw new AnimationValidationError(`Color channel ${name} is invalid.`, {
        code: "INVALID_VALUE"
      });
}

export function interpolateColor(
  from: Readonly<RgbaColor>,
  to: Readonly<RgbaColor>,
  progress: number
): RgbaColor {
  validateColor(from);
  validateColor(to);
  const value = clampProgress(progress);
  if (value === 0) return Object.freeze({ ...from });
  if (value === 1) return Object.freeze({ ...to });
  return Object.freeze({
    r: Math.round(interpolateNumber(from.r, to.r, value)),
    g: Math.round(interpolateNumber(from.g, to.g, value)),
    b: Math.round(interpolateNumber(from.b, to.b, value)),
    a: interpolateNumber(from.a, to.a, value)
  });
}

export function normalizeAngle(degrees: number): number {
  finite(degrees, "Angle");
  return ((degrees % 360) + 360) % 360;
}

export function interpolateAngle(
  from: number,
  to: number,
  progress: number,
  direction: AngleDirection = "direct"
): number {
  finite(from, "From angle");
  finite(to, "To angle");
  if (clampProgress(progress) === 0) return from;
  if (clampProgress(progress) === 1) return to;
  let delta = to - from;
  if (direction !== "direct") {
    delta = ((delta % 360) + 360) % 360;
    if (direction === "shortest" && delta > 180) delta -= 360;
    if (direction === "counter-clockwise" && delta > 0) delta -= 360;
    // Exact 180-degree shortest-path ties resolve clockwise.
  }
  return from + delta * clampProgress(progress);
}

export function interpolateVector2(
  from: Readonly<Vector2Value>,
  to: Readonly<Vector2Value>,
  progress: number
): Vector2Value {
  return Object.freeze({
    x: interpolateNumber(from.x, to.x, progress),
    y: interpolateNumber(from.y, to.y, progress)
  });
}

export function interpolateVector3(
  from: Readonly<Vector3Value>,
  to: Readonly<Vector3Value>,
  progress: number
): Vector3Value {
  return Object.freeze({
    ...interpolateVector2(from, to, progress),
    z: interpolateNumber(from.z, to.z, progress)
  });
}

export function interpolateMatrix2D(
  from: Readonly<Matrix2DValue>,
  to: Readonly<Matrix2DValue>,
  progress: number
): Matrix2DValue {
  return Object.freeze({
    a: interpolateNumber(from.a, to.a, progress),
    b: interpolateNumber(from.b, to.b, progress),
    c: interpolateNumber(from.c, to.c, progress),
    d: interpolateNumber(from.d, to.d, progress),
    e: interpolateNumber(from.e, to.e, progress),
    f: interpolateNumber(from.f, to.f, progress)
  });
}

export function normalizeTransform(value: Partial<TransformValue>): TransformValue {
  const translation = value.translation ?? { x: 0, y: 0 };
  const scale = value.scale ?? { x: 1, y: 1 };
  const skew = value.skew ?? { x: 0, y: 0 };
  return Object.freeze({
    translation: Object.freeze({
      x: finite(translation.x, "Translation x"),
      y: finite(translation.y, "Translation y")
    }),
    rotationDeg: finite(value.rotationDeg ?? 0, "Rotation"),
    scale: Object.freeze({ x: finite(scale.x, "Scale x"), y: finite(scale.y, "Scale y") }),
    skew: Object.freeze({ x: finite(skew.x, "Skew x"), y: finite(skew.y, "Skew y") }),
    order: Object.freeze(["translation", "rotation", "skew", "scale"] as const)
  });
}

export function interpolateTransform(
  fromInput: Partial<TransformValue>,
  toInput: Partial<TransformValue>,
  progress: number
): TransformValue {
  const from = normalizeTransform(fromInput);
  const to = normalizeTransform(toInput);
  return Object.freeze({
    translation: interpolateVector2(from.translation, to.translation, progress),
    rotationDeg: interpolateAngle(from.rotationDeg, to.rotationDeg, progress),
    scale: interpolateVector2(from.scale, to.scale, progress),
    skew: interpolateVector2(from.skew, to.skew, progress),
    order: from.order
  });
}

export class InterpolationRegistry {
  readonly #entries = new Map<PrimitiveInterpolationId, (progress: number) => number>();

  public constructor() {
    this.#entries.set("linear", linear);
    this.#entries.set("ease-in", easeIn);
    this.#entries.set("ease-out", easeOut);
    this.#entries.set("ease-in-out", easeInOut);
    this.#entries.set("step", step);
    this.#entries.set("discrete", (value) => (clampProgress(value) < 0.5 ? 0 : 1));
  }

  public register(id: PrimitiveInterpolationId, interpolation: (progress: number) => number): void {
    if (id.trim() === "" || this.#entries.has(id) || typeof interpolation !== "function")
      throw new AnimationValidationError(`Interpolation '${id}' cannot be registered.`, {
        code: "UNSUPPORTED_INTERPOLATION"
      });
    this.#entries.set(id, interpolation);
  }

  public unregister(id: PrimitiveInterpolationId): boolean {
    if (["linear", "ease-in", "ease-out", "ease-in-out", "step", "discrete"].includes(id))
      return false;
    return this.#entries.delete(id);
  }

  public resolve(id: PrimitiveInterpolationId): (progress: number) => number {
    const interpolation = this.#entries.get(id);
    if (interpolation === undefined)
      throw new AnimationValidationError(`Interpolation '${id}' is not registered.`, {
        code: "UNSUPPORTED_INTERPOLATION"
      });
    return (progress) => {
      try {
        return clampProgress(interpolation(clampProgress(progress)));
      } catch (cause) {
        throw new AnimationValidationError(`Interpolation '${id}' failed.`, {
          code: "NaN_RESULT",
          cause
        });
      }
    };
  }

  public list(): readonly PrimitiveInterpolationId[] {
    return Object.freeze([...this.#entries.keys()].sort());
  }
}
