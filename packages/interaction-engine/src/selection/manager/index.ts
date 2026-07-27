import type { InteractionTarget } from "../../types/index.js";
import { SelectionDiagnostics } from "../diagnostics/index.js";
import type { SelectionEvent, SelectionEventType } from "../events/index.js";
import { SelectionChangingEvent } from "../events/index.js";
import { SelectionError } from "../errors/index.js";
import { SelectionObservers, type SelectionObserver } from "../observers/index.js";
import {
  CompositeSelectionPolicy,
  MetadataSelectionPolicy,
  ReadOnlySelectionPolicy,
  type SelectionPolicy
} from "../policies/index.js";
import {
  EMPTY_SELECTION_STATE,
  createSelectionState,
  selectionKey,
  type SelectionState
} from "../state/index.js";
import type { SelectionMode, SelectionRequest, SelectionSource } from "../types/index.js";
import { sameSelection, uniqueTargets } from "../utils/index.js";

export interface SelectionManagerOptions {
  readonly policies?: readonly SelectionPolicy[];
  readonly readOnly?: boolean;
  readonly diagnostics?: SelectionDiagnostics;
}

export class SelectionManager {
  #state: SelectionState = EMPTY_SELECTION_STATE;
  readonly #observers = new SelectionObservers();
  readonly #policy: SelectionPolicy;
  readonly #readOnly: boolean;
  readonly #diagnostics: SelectionDiagnostics;
  #disposed = false;
  public constructor(options: SelectionManagerOptions = {}) {
    this.#policy = new CompositeSelectionPolicy([
      new MetadataSelectionPolicy(),
      new ReadOnlySelectionPolicy(),
      ...(options.policies ?? [])
    ]);
    this.#readOnly = options.readOnly ?? false;
    this.#diagnostics = options.diagnostics ?? new SelectionDiagnostics();
  }
  public get state(): SelectionState {
    return this.#state;
  }
  public get size(): number {
    return this.#state.selection.length;
  }
  public get isEmpty(): boolean {
    return this.size === 0;
  }
  public contains(target: Readonly<InteractionTarget>): boolean {
    return this.#state.selectedIds.has(selectionKey(target));
  }
  public getPrimary(): InteractionTarget | undefined {
    return this.#state.primary;
  }
  public getSelection(): readonly InteractionTarget[] {
    return this.#state.selection;
  }
  public select(
    target: InteractionTarget,
    mode: SelectionMode = "single",
    source: SelectionSource = "api"
  ): boolean {
    return this.update({ targets: [target], mode, source, activeTarget: target });
  }
  public selectMany(
    targets: readonly InteractionTarget[],
    mode: SelectionMode = "multi",
    source: SelectionSource = "api"
  ): boolean {
    return this.update({ targets, mode, source });
  }
  public toggle(target: InteractionTarget, source: SelectionSource = "api"): boolean {
    return this.select(target, "toggle", source);
  }
  public replace(targets: readonly InteractionTarget[], source: SelectionSource = "api"): boolean {
    return this.selectMany(targets, "replace", source);
  }
  public clear(source: SelectionSource = "api"): boolean {
    return this.update({ targets: [], mode: "replace", source });
  }
  public setPrimary(target: InteractionTarget, source: SelectionSource = "api"): boolean {
    this.#assertUsable();
    if (!this.contains(target))
      throw new SelectionError(
        "SELECTION_VALIDATION",
        "Primary target must already be selected.",
        true
      );
    return this.#transition(this.#state.selection, target, target, "replace", source);
  }
  public update(request: Readonly<SelectionRequest>): boolean {
    this.#assertUsable();
    if (
      (request.mode === "replace" || request.mode === "single") &&
      request.activeTarget === undefined &&
      request.targets.length === this.#state.selection.length &&
      request.targets.every((target, index) => selectionKey(target) === this.#state.order[index])
    )
      return false;
    const allowed = uniqueTargets(request.targets).filter((target) =>
      this.#policy.allows(target, { state: this.#state, readOnly: this.#readOnly })
    );
    const current = this.#state.selection;
    const currentKeys = new Set(current.map(selectionKey));
    const requestKeys = new Set(allowed.map(selectionKey));
    let next: readonly InteractionTarget[];
    switch (request.mode) {
      case "remove":
        next = current.filter((target) => !requestKeys.has(selectionKey(target)));
        break;
      case "toggle":
        next = [
          ...current.filter((target) => !requestKeys.has(selectionKey(target))),
          ...allowed.filter((target) => !currentKeys.has(selectionKey(target)))
        ];
        break;
      case "add":
      case "multi":
        next = [...current, ...allowed.filter((target) => !currentKeys.has(selectionKey(target)))];
        break;
      case "single":
      case "replace":
      default:
        next = allowed;
        break;
    }
    const primary =
      next.length === 0
        ? undefined
        : next.some(
              (target) => selectionKey(target) === selectionKey(this.#state.primary ?? target)
            )
          ? (this.#state.primary ?? next[0])
          : next[0];
    return this.#transition(next, primary, request.activeTarget, request.mode, request.source);
  }
  public subscribe(
    observer: SelectionObserver,
    options?: { readonly type?: SelectionEventType; readonly priority?: number }
  ): () => void {
    this.#assertUsable();
    return this.#observers.subscribe(observer, options);
  }
  public once(
    observer: SelectionObserver,
    options?: { readonly type?: SelectionEventType; readonly priority?: number }
  ): () => void {
    this.#assertUsable();
    return this.#observers.once(observer, options);
  }
  public unsubscribe(observer: SelectionObserver): void {
    this.#observers.unsubscribe(observer);
  }
  public get diagnostics(): SelectionDiagnostics {
    return this.#diagnostics;
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#observers.dispose();
    this.#disposed = true;
  }
  #transition(
    targets: readonly InteractionTarget[],
    primary: InteractionTarget | undefined,
    activeTarget: InteractionTarget | undefined,
    mode: SelectionMode,
    source: SelectionSource
  ): boolean {
    if (sameSelection(this.#state, targets, primary, activeTarget)) return false;
    const previous = this.#state;
    const previousByKey = new Map(
      previous.selection.map((target) => [selectionKey(target), target])
    );
    const nextByKey = new Map(targets.map((target) => [selectionKey(target), target]));
    const added = Object.freeze(
      targets.filter((target) => !previousByKey.has(selectionKey(target)))
    );
    const removed = Object.freeze(
      previous.selection.filter((target) => !nextByKey.has(selectionKey(target)))
    );
    const next = createSelectionState({
      selection: targets,
      order: targets.map(selectionKey),
      revision: previous.revision + 1,
      mode,
      source,
      ...(primary === undefined ? {} : { primary }),
      ...(activeTarget === undefined ? {} : { activeTarget })
    });
    const changing = new SelectionChangingEvent(previous, next, added, removed);
    this.#observers.notify(changing);
    if (changing.cancelled) return false;
    this.#state = next;
    const events = this.#events(previous, next, added, removed);
    for (const event of events) this.#observers.notify(event);
    this.#diagnostics.recordTransition(events.length + 1);
    return true;
  }
  #events(
    previous: SelectionState,
    state: SelectionState,
    added: readonly InteractionTarget[],
    removed: readonly InteractionTarget[]
  ): readonly SelectionEvent[] {
    const base = { previous, state, added, removed };
    const events: SelectionEvent[] = [];
    if (added.length > 0) events.push(Object.freeze({ type: "selection-added", ...base }));
    if (removed.length > 0) events.push(Object.freeze({ type: "selection-removed", ...base }));
    if (state.selection.length === 0)
      events.push(Object.freeze({ type: "selection-cleared", ...base }));
    if (
      selectionKey(previous.primary ?? { id: "", kind: "custom" }) !==
      selectionKey(state.primary ?? { id: "", kind: "custom" })
    )
      events.push(Object.freeze({ type: "primary-selection-changed", ...base }));
    events.push(Object.freeze({ type: "selection-changed", ...base }));
    return events;
  }
  #assertUsable(): void {
    if (this.#disposed)
      throw new SelectionError("SELECTION_DISPOSED", "Selection manager is disposed.", false);
  }
}
