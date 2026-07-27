import { KeyboardDiagnostics } from "../diagnostics/keyboard-diagnostics.js";
import { FocusError } from "../errors/index.js";
import {
  CompositeFocusPolicy,
  DisabledFocusPolicy,
  LockedFocusPolicy,
  ReadOnlyFocusPolicy,
  VisibilityFocusPolicy
} from "../policies/focus-policies.js";
import type {
  FocusPolicy,
  FocusState,
  FocusTarget,
  NavigationDirection
} from "../types/keyboard.js";

export interface FocusEngineOptions {
  readonly policies?: readonly FocusPolicy[];
  readonly readOnly?: boolean;
  readonly diagnostics?: KeyboardDiagnostics;
}

function compareTargets(left: FocusTarget, right: FocusTarget): number {
  return (
    (left.order ?? 0) - (right.order ?? 0) ||
    left.kind.localeCompare(right.kind) ||
    left.id.localeCompare(right.id)
  );
}

export class FocusEngine {
  readonly #policy: FocusPolicy;
  readonly #readOnly: boolean;
  readonly #diagnostics: KeyboardDiagnostics;
  #targets: readonly FocusTarget[] = [];
  #order: readonly string[] = Object.freeze([]);
  #indexByKey = new Map<string, number>();
  #targetById = new Map<string, FocusTarget>();
  #firstChildByParent = new Map<string, FocusTarget>();
  #state: FocusState = Object.freeze({ order: Object.freeze([]), revision: 0 });
  #disposed = false;

  public constructor(options: FocusEngineOptions = {}) {
    this.#policy = new CompositeFocusPolicy([
      new VisibilityFocusPolicy(),
      new LockedFocusPolicy(),
      new DisabledFocusPolicy(),
      new ReadOnlyFocusPolicy(),
      ...(options.policies ?? [])
    ]);
    this.#readOnly = options.readOnly ?? false;
    this.#diagnostics = options.diagnostics ?? new KeyboardDiagnostics();
  }
  public get state(): FocusState {
    return this.#state;
  }
  public setTargets(targets: readonly FocusTarget[]): FocusState {
    this.#assertUsable();
    const unique = new Map<string, FocusTarget>();
    for (const target of targets)
      unique.set(`${target.kind}:${target.id}`, Object.freeze({ ...target }));
    this.#targets = Object.freeze(
      [...unique.values()]
        .filter((target) => this.#policy.allows(target, { readOnly: this.#readOnly }))
        .sort(compareTargets)
    );
    this.#order = Object.freeze(this.#targets.map(({ kind, id }) => `${kind}:${id}`));
    this.#indexByKey = new Map(this.#order.map((key, index) => [key, index]));
    this.#targetById = new Map(this.#targets.map((target) => [target.id, target]));
    this.#firstChildByParent = new Map();
    for (const target of this.#targets)
      if (target.parentId !== undefined && !this.#firstChildByParent.has(target.parentId))
        this.#firstChildByParent.set(target.parentId, target);
    const current = this.#state.target;
    const target =
      current === undefined
        ? undefined
        : this.#targets.find(({ id, kind }) => id === current.id && kind === current.kind);
    return this.#replace(target);
  }
  public focus(target: FocusTarget | undefined): FocusState {
    this.#assertUsable();
    if (target !== undefined) {
      const resolved = this.#targets.find(
        ({ id, kind }) => id === target.id && kind === target.kind
      );
      if (resolved === undefined)
        throw new FocusError("FOCUS_TARGET_INVALID", `Focus target is unavailable: ${target.id}`);
      return this.#replace(resolved);
    }
    return this.#replace(undefined);
  }
  public traverse(direction: NavigationDirection): FocusState {
    this.#assertUsable();
    if (this.#targets.length === 0) return this.#replace(undefined);
    const current = this.#state.target;
    const index =
      current === undefined ? -1 : (this.#indexByKey.get(`${current.kind}:${current.id}`) ?? -1);
    let target: FocusTarget | undefined;
    if (direction === "first" || direction === "page-up") target = this.#targets[0];
    else if (direction === "last" || direction === "page-down")
      target = this.#targets[this.#targets.length - 1];
    else if (direction === "next")
      target = this.#targets[(index + 1 + this.#targets.length) % this.#targets.length];
    else if (direction === "previous")
      target = this.#targets[(index - 1 + this.#targets.length) % this.#targets.length];
    else if (direction === "parent")
      target =
        current?.parentId === undefined
          ? current
          : (this.#targetById.get(current.parentId) ?? current);
    else
      target =
        current === undefined
          ? this.#targets[0]
          : (this.#firstChildByParent.get(current.id) ?? current);
    return this.#replace(target);
  }
  public dispose(): void {
    this.#targets = [];
    this.#order = Object.freeze([]);
    this.#indexByKey.clear();
    this.#targetById.clear();
    this.#firstChildByParent.clear();
    this.#state = Object.freeze({ order: Object.freeze([]), revision: this.#state.revision + 1 });
    this.#disposed = true;
  }
  #replace(target: FocusTarget | undefined): FocusState {
    if (
      this.#state.target?.id === target?.id &&
      this.#state.target?.kind === target?.kind &&
      this.#state.order === this.#order
    )
      return this.#state;
    this.#state = Object.freeze({
      order: this.#order,
      revision: this.#state.revision + 1,
      ...(target === undefined ? {} : { target })
    });
    this.#diagnostics.recordFocus();
    return this.#state;
  }
  #assertUsable(): void {
    if (this.#disposed) throw new FocusError("FOCUS_DISPOSED", "Focus engine is disposed.");
  }
}
export * from "./accessibility-focus.js";
