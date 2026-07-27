import { generateAriaMetadata } from "../aria/index.js";
import { AccessibilityDiagnostics } from "../diagnostics/accessibility-diagnostics.js";
import { AccessibilityError } from "../errors/index.js";
import type {
  AccessibilityEvent,
  AccessibilityEventListener
} from "../events/accessibility-events.js";
import type { AccessibilityFocusManager } from "../focus/accessibility-focus.js";
import { LiveRegion } from "../live-region/index.js";
import {
  CompositeAccessibilityPolicy,
  DecorativeAccessibilityPolicy,
  DisabledAccessibilityPolicy,
  HiddenAccessibilityPolicy,
  LockedAccessibilityPolicy,
  ReadOnlyAccessibilityPolicy
} from "../policies/accessibility-policies.js";
import { AccessibilityRoleRegistry } from "../roles/index.js";
import {
  createAccessibilityState,
  DEFAULT_ACCESSIBILITY_PREFERENCES
} from "../state/accessibility-state.js";
import {
  AccessibilityTree,
  type AccessibilityTreeUpdate,
  type AccessibilityTreeUpdateResult
} from "../tree/index.js";
import type {
  AccessibilityNode,
  AccessibilityPolicy,
  AccessibilityPreferences,
  AccessibilityRendererAdapter,
  AccessibilityState,
  Announcement,
  AnnouncementInput,
  ScreenReaderAdapter
} from "../types/accessibility.js";

export interface AccessibilityEngineOptions {
  readonly focus: AccessibilityFocusManager;
  readonly screenReader: ScreenReaderAdapter;
  readonly renderer?: AccessibilityRendererAdapter;
  readonly roles?: AccessibilityRoleRegistry;
  readonly policies?: readonly AccessibilityPolicy[];
  readonly diagnostics?: AccessibilityDiagnostics;
  readonly preferences?: Partial<AccessibilityPreferences>;
  readonly readOnly?: boolean;
}

const EMPTY_FOCUS = Object.freeze({ order: Object.freeze([]), revision: 0 });

export class AccessibilityEngine {
  readonly #tree = new AccessibilityTree();
  readonly #focus: AccessibilityFocusManager;
  readonly #liveRegion: LiveRegion;
  readonly #renderer: AccessibilityRendererAdapter | undefined;
  readonly #roles: AccessibilityRoleRegistry;
  readonly #policy: AccessibilityPolicy;
  readonly #diagnostics: AccessibilityDiagnostics;
  readonly #listeners = new Set<AccessibilityEventListener>();
  readonly #readOnly: boolean;
  #state: AccessibilityState;
  #disposed = false;

  public constructor(options: AccessibilityEngineOptions) {
    this.#focus = options.focus;
    this.#liveRegion = new LiveRegion(options.screenReader);
    this.#renderer = options.renderer;
    this.#roles = options.roles ?? new AccessibilityRoleRegistry();
    this.#diagnostics = options.diagnostics ?? new AccessibilityDiagnostics();
    this.#readOnly = options.readOnly ?? false;
    this.#policy = new CompositeAccessibilityPolicy([
      new HiddenAccessibilityPolicy(),
      new DisabledAccessibilityPolicy(),
      new LockedAccessibilityPolicy(),
      new DecorativeAccessibilityPolicy(),
      new ReadOnlyAccessibilityPolicy(),
      ...(options.policies ?? [])
    ]);
    this.#state = createAccessibilityState({
      tree: this.#tree.state,
      focus: EMPTY_FOCUS,
      preferences: {
        ...DEFAULT_ACCESSIBILITY_PREFERENCES,
        ...options.preferences
      }
    });
  }
  public get state(): AccessibilityState {
    return this.#state;
  }
  public subscribe(listener: AccessibilityEventListener): () => void {
    this.#assertUsable();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  public update(nodes: readonly AccessibilityNode[]): AccessibilityState {
    this.#assertUsable();
    for (const node of nodes) this.#roles.require(node.role);
    const result = this.#tree.replace(nodes, [this.#policy], this.#readOnly);
    return this.#commitTreeUpdate(result);
  }
  public updateIncremental(update: AccessibilityTreeUpdate): AccessibilityState {
    this.#assertUsable();
    for (const node of update.upsert ?? []) this.#roles.require(node.role);
    const included: AccessibilityNode[] = [];
    const removed = new Set(update.remove ?? []);
    for (const node of update.upsert ?? [])
      if (this.#policy.includes(node, { readOnly: this.#readOnly })) included.push(node);
      else removed.add(node.id);
    return this.#commitTreeUpdate(
      this.#tree.update({
        upsert: included,
        remove: [...removed]
      })
    );
  }
  #commitTreeUpdate(result: AccessibilityTreeUpdateResult): AccessibilityState {
    const previousAria = this.#state.aria;
    const aria = new Map(previousAria);
    for (const id of result.removedIds) aria.delete(id);
    for (const id of result.changedIds) {
      const node = result.state.nodes.get(id);
      if (node !== undefined) aria.set(id, generateAriaMetadata(node));
    }
    const accessibleNodes = [...result.state.nodes.values()];
    let focus = this.#focus.synchronize(accessibleNodes);
    const selected = accessibleNodes.find(
      ({ state, focusable }) => state.selected === true && focusable
    );
    if (selected !== undefined) focus = this.#focus.focusNode(selected.id);
    this.#state = createAccessibilityState({
      tree: result.state,
      focus,
      aria,
      preferences: this.#state.preferences,
      revision: this.#state.revision + 1
    });
    this.#diagnostics.recordTreeUpdate();
    this.#diagnostics.recordAria(result.changedIds.length);
    this.#diagnostics.recordRole(result.changedIds.length);
    this.#diagnostics.recordFocus();
    this.#renderer?.updateNodes(this.#state, result.changedIds, result.removedIds);
    this.#emit({ type: "accessibility-tree-updated", tree: result.state });
    this.#emit({ type: "accessibility-focus-changed", focus });
    this.#emit({ type: "accessibility-updated", state: this.#state });
    return this.#state;
  }
  public setPreferences(preferences: Partial<AccessibilityPreferences>): AccessibilityState {
    this.#assertUsable();
    this.#state = createAccessibilityState({
      tree: this.#state.tree,
      focus: this.#state.focus,
      aria: this.#state.aria,
      preferences: { ...this.#state.preferences, ...preferences },
      revision: this.#state.revision + 1
    });
    this.#renderer?.updateAccessibility(this.#state);
    this.#emit({ type: "accessibility-updated", state: this.#state });
    return this.#state;
  }
  public announce(input: AnnouncementInput): Announcement | undefined {
    this.#assertUsable();
    const announcement = this.#liveRegion.announce(input);
    if (announcement !== undefined) {
      this.#diagnostics.recordAnnouncement();
      this.#diagnostics.recordLiveRegion();
      this.#emit({ type: "announcement-queued", announcement });
    }
    return announcement;
  }
  public flushAnnouncements(limit?: number): readonly Announcement[] {
    this.#assertUsable();
    const delivered = this.#liveRegion.flush(limit);
    for (const announcement of delivered)
      this.#emit({ type: "announcement-delivered", announcement });
    return delivered;
  }
  public cancelAnnouncement(id: string): boolean {
    this.#assertUsable();
    return this.#liveRegion.cancel(id);
  }
  public restoreFocus(): void {
    const focus = this.#focus.restore();
    this.#state = createAccessibilityState({
      tree: this.#state.tree,
      focus,
      aria: this.#state.aria,
      preferences: this.#state.preferences,
      revision: this.#state.revision + 1
    });
    this.#renderer?.updateAccessibility(this.#state);
    this.#emit({ type: "accessibility-focus-changed", focus });
  }
  public dispose(): void {
    if (this.#disposed) return;
    this.#liveRegion.dispose();
    this.#tree.dispose();
    this.#renderer?.clearAccessibility();
    this.#listeners.clear();
    this.#disposed = true;
  }
  #emit(event: AccessibilityEvent): void {
    const immutable = Object.freeze({ ...event }) as AccessibilityEvent;
    for (const listener of [...this.#listeners]) listener(immutable);
  }
  #assertUsable(): void {
    if (this.#disposed)
      throw new AccessibilityError("ACCESSIBILITY_DISPOSED", "Accessibility engine is disposed.");
  }
}
