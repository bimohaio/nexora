import type { JsonValue, ScadaDocument } from "@web-scada/core";
import {
  AnimationPrimitiveFactory,
  BUILT_IN_PRIMITIVE_IDS,
  InterpolationRegistry,
  PrimitiveSchedulerAdapter,
  SharedAnimationScheduler,
  SystemAnimationClock,
  createBuiltInAnimationPrimitiveRegistry,
  resolveAnimationConflicts,
  type AnimationClock,
  type AnimationCompositionMode,
  type AnimationContribution,
  type AnimationFrameDriver,
  type AnimationInstanceId,
  type AnimationScheduler,
  type AnimationTimeSource,
  type PrimitiveAnimationInstance,
  type PrimitiveId,
  type PrimitiveInstanceId,
  type ReducedMotionState,
  type VisibilityState
} from "@web-scada/animation-engine";
import {
  resolveSymbolAnimationMetadata,
  type SymbolAnimationSlotDefinition,
  type SymbolAnimationTargetDefinition,
  type SymbolDefinition,
  type SymbolRegistry
} from "@web-scada/symbols";

export type SymbolAnimationDiagnosticCode =
  | "ANIMATION_SYMBOL_NOT_FOUND"
  | "ANIMATION_SLOT_NOT_FOUND"
  | "ANIMATION_TARGET_NOT_FOUND"
  | "ANIMATION_BINDING_INVALID"
  | "ANIMATION_PRIMITIVE_UNSUPPORTED"
  | "ANIMATION_INSTANCE_FAILED"
  | "ANIMATION_RENDERER_FAILED";

export interface SymbolAnimationDiagnostic {
  readonly code: SymbolAnimationDiagnosticCode;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly entityId?: string;
  readonly slotId?: string;
  readonly timestamp: number;
}

export interface SymbolAnimationSample {
  readonly entityId: string;
  readonly slotId: string;
  readonly target: SymbolAnimationTargetDefinition;
  readonly channel: string;
  readonly value: unknown;
  readonly priority: number;
  readonly revision: number;
}

interface StoredSample extends SymbolAnimationSample {
  readonly instanceId: AnimationInstanceId;
  readonly registrationOrder: number;
  readonly composition: AnimationCompositionMode;
}

export class TransientAnimationValueStore {
  readonly #samples = new Map<AnimationInstanceId, StoredSample>();
  #revision = 0;

  public set(sample: Omit<StoredSample, "revision">): void {
    this.#revision += 1;
    this.#samples.set(sample.instanceId, Object.freeze({ ...sample, revision: this.#revision }));
  }

  public remove(instanceId: AnimationInstanceId): void {
    if (this.#samples.delete(instanceId)) this.#revision += 1;
  }

  public getComposed(entityId: string): readonly SymbolAnimationSample[] {
    const owned = [...this.#samples.values()].filter((sample) => sample.entityId === entityId);
    const contributions: AnimationContribution[] = owned.map((sample) => ({
      instanceId: sample.instanceId,
      entityId: sample.entityId,
      target: {
        entityId: sample.entityId,
        kind: "node",
        property: sample.target.property,
        part: sample.target.part
      },
      priority: sample.priority,
      registrationOrder: sample.registrationOrder,
      composition: sample.composition,
      value: sample.value as AnimationContribution["value"]
    }));
    const winnerIds = new Set(
      resolveAnimationConflicts(contributions).map(({ instanceId }) => instanceId)
    );
    return Object.freeze(
      owned
        .filter(({ instanceId }) => winnerIds.has(instanceId))
        .map(
          ({ instanceId: _instanceId, registrationOrder: _order, composition: _mode, ...sample }) =>
            Object.freeze(sample)
        )
    );
  }

  public clearEntity(entityId: string): void {
    for (const [id, sample] of this.#samples)
      if (sample.entityId === entityId) this.#samples.delete(id);
    this.#revision += 1;
  }

  public clear(): void {
    this.#samples.clear();
    this.#revision += 1;
  }

  public get size(): number {
    return this.#samples.size;
  }
}

const primitiveIds: Readonly<Record<SymbolAnimationSlotDefinition["primitive"], PrimitiveId>> = {
  scalar: BUILT_IN_PRIMITIVE_IDS.scalar,
  boolean: BUILT_IN_PRIMITIVE_IDS.boolean,
  integer: BUILT_IN_PRIMITIVE_IDS.integer,
  opacity: BUILT_IN_PRIMITIVE_IDS.opacity,
  color: BUILT_IN_PRIMITIVE_IDS.color,
  rotation: BUILT_IN_PRIMITIVE_IDS.rotation,
  translation: BUILT_IN_PRIMITIVE_IDS.translation,
  scale: BUILT_IN_PRIMITIVE_IDS.scale,
  transform: BUILT_IN_PRIMITIVE_IDS.transform,
  keyframe: BUILT_IN_PRIMITIVE_IDS.keyframe
};

export interface AnimationInstanceFactoryRequest {
  readonly entityId: string;
  readonly slot: SymbolAnimationSlotDefinition;
  readonly from?: JsonValue;
  readonly to?: JsonValue;
  readonly durationMs?: number;
  readonly playbackRate?: number;
}

export class SymbolAnimationInstanceFactory {
  readonly #factory: AnimationPrimitiveFactory;
  #sequence = 0;

  public constructor(
    private readonly clock: AnimationClock,
    factory = new AnimationPrimitiveFactory(
      createBuiltInAnimationPrimitiveRegistry(),
      new InterpolationRegistry()
    )
  ) {
    this.#factory = factory;
  }

  public create(request: AnimationInstanceFactoryRequest): PrimitiveAnimationInstance<unknown> {
    const repeat =
      request.slot.defaults.iterations === "infinite"
        ? ({ kind: "infinite" } as const)
        : request.slot.defaults.iterations === undefined || request.slot.defaults.iterations === 1
          ? ({ kind: "once" } as const)
          : ({ kind: "count", count: request.slot.defaults.iterations } as const);
    return this.#factory.create({
      id: `${request.entityId}:${request.slot.id}:${String(++this.#sequence)}` as PrimitiveInstanceId,
      primitiveId: primitiveIds[request.slot.primitive],
      configuration: {
        timing: {
          durationMs: request.durationMs ?? request.slot.defaults.durationMs,
          playbackRate: request.playbackRate ?? 1,
          direction: request.slot.defaults.direction ?? "normal",
          fillMode: "both",
          repeat
        },
        from: request.from ?? request.slot.defaults.from,
        to: request.to ?? request.slot.defaults.to
      },
      context: { clock: this.clock }
    });
  }
}

interface ActiveSlot {
  readonly slot: SymbolAnimationSlotDefinition;
  readonly target: SymbolAnimationTargetDefinition;
  readonly instance: PrimitiveAnimationInstance<unknown>;
  readonly adapter: PrimitiveSchedulerAdapter<unknown>;
  readonly instanceId: AnimationInstanceId;
  readonly order: number;
  durationMs: number;
}

export class SymbolAnimationController {
  readonly #active = new Map<string, ActiveSlot>();
  #order = 0;
  #disposed = false;

  public constructor(
    public readonly entityId: string,
    private readonly definition: SymbolDefinition,
    private readonly scheduler: AnimationScheduler,
    private readonly factory: SymbolAnimationInstanceFactory,
    private readonly store: TransientAnimationValueStore,
    private readonly report: (diagnostic: SymbolAnimationDiagnostic) => void
  ) {}

  public play(
    slotId: string,
    overrides: {
      readonly from?: JsonValue;
      readonly to?: JsonValue;
      readonly durationMs?: number;
    } = {}
  ): void {
    this.#assertUsable();
    this.stop(slotId);
    const slot = this.definition.animation?.slots.find(({ id }) => id === slotId);
    if (slot === undefined)
      { this.#diagnose("ANIMATION_SLOT_NOT_FOUND", `Unknown slot '${slotId}'.`, slotId); return; }
    const target = this.definition.animation?.targets.find(({ id }) => id === slot.target);
    if (target === undefined)
      { this.#diagnose(
        "ANIMATION_TARGET_NOT_FOUND",
        `Unknown target '${slot.target}'.`,
        slotId
      ); return; }
    try {
      const instance = this.factory.create({ entityId: this.entityId, slot, ...overrides });
      const instanceId = instance.id as unknown as AnimationInstanceId;
      const adapter = new PrimitiveSchedulerAdapter<unknown>(this.scheduler);
      const order = ++this.#order;
      const active: ActiveSlot = {
        slot,
        target,
        instance,
        adapter,
        instanceId,
        order,
        durationMs: overrides.durationMs ?? slot.defaults.durationMs
      };
      this.#active.set(slotId, active);
      adapter.attach({
        instance,
        priority: "runtime",
        motionBehavior: slot.reducedMotion ?? "disable",
        invalidation: { targetType: "symbol", targetId: this.entityId, reason: slot.channel },
        onResult: (value) => {
          if (value === undefined) this.store.remove(instanceId);
          else
            this.store.set({
              instanceId,
              entityId: this.entityId,
              slotId,
              target,
              channel: slot.channel,
              value,
              priority: slot.priority ?? 0,
              registrationOrder: order,
              composition: "replace"
            });
        }
      });
    } catch (error) {
      this.#diagnose(
        "ANIMATION_INSTANCE_FAILED",
        error instanceof Error ? error.message : "Animation instance failed.",
        slotId
      );
    }
  }

  public pause(): void {
    for (const active of this.#active.values()) active.adapter.pause();
  }

  public resume(): void {
    for (const active of this.#active.values()) active.adapter.resume();
  }

  public restart(slotId: string): void {
    const active = this.#active.get(slotId);
    if (active !== undefined) this.play(slotId, { durationMs: active.durationMs });
  }

  public seek(slotId: string, progress: number): void {
    const active = this.#active.get(slotId);
    if (active === undefined) return;
    const result = active.instance.seekProgress(progress);
    if (result.value !== undefined)
      this.store.set({
        instanceId: active.instanceId,
        entityId: this.entityId,
        slotId,
        target: active.target,
        channel: active.slot.channel,
        value: result.value,
        priority: active.slot.priority ?? 0,
        registrationOrder: active.order,
        composition: "replace"
      });
  }

  public setPlaybackRate(rate: number): void {
    for (const active of this.#active.values()) active.instance.setPlaybackRate(rate);
  }

  public reverse(): void {
    for (const active of this.#active.values()) active.instance.reverse();
  }

  public playProperty(property: string, to: JsonValue): boolean {
    const target = this.definition.animation?.targets.find((entry) => entry.property === property);
    const slot = this.definition.animation?.slots.find((entry) => entry.target === target?.id);
    if (slot === undefined) return false;
    this.play(slot.id, { to });
    return true;
  }

  public stop(slotId?: string): void {
    const ids = slotId === undefined ? [...this.#active.keys()] : [slotId];
    for (const id of ids) {
      const active = this.#active.get(id);
      if (active === undefined) continue;
      active.adapter.dispose();
      this.store.remove(active.instanceId);
      this.#active.delete(id);
    }
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.store.clearEntity(this.entityId);
    this.#disposed = true;
  }

  public get activeSlotIds(): readonly string[] {
    return Object.freeze([...this.#active.keys()]);
  }

  public get slotIds(): readonly string[] {
    return Object.freeze(this.definition.animation?.slots.map(({ id }) => id) ?? []);
  }

  public get symbolType(): string {
    return this.definition.type;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Symbol animation controller is disposed.");
  }

  #diagnose(code: SymbolAnimationDiagnosticCode, message: string, slotId?: string): void {
    this.report({
      code,
      severity: "error",
      message,
      entityId: this.entityId,
      ...(slotId === undefined ? {} : { slotId }),
      timestamp: Date.now()
    });
  }
}

export interface RuntimeAnimationManagerOptions {
  readonly symbols: SymbolRegistry;
  readonly timeSource?: AnimationTimeSource;
  readonly frameDriver: AnimationFrameDriver;
  readonly onSamples?: (entityId: string, samples: readonly SymbolAnimationSample[]) => void;
  readonly onDiagnostic?: (diagnostic: SymbolAnimationDiagnostic) => void;
  readonly reducedMotion?: ReducedMotionState;
  readonly visibility?: VisibilityState;
}

export interface SymbolAnimationBindingInput {
  readonly entityId: string;
  readonly parameter:
    "enabled" | "speed" | "direction" | "duration" | "opacity" | "color" | "level" | "flow";
  readonly value: unknown;
  readonly slotId?: string;
}

export class RuntimeAnimationManager {
  readonly #controllers = new Map<string, SymbolAnimationController>();
  readonly #diagnostics: SymbolAnimationDiagnostic[] = [];
  readonly #store = new TransientAnimationValueStore();
  readonly #scheduler: SharedAnimationScheduler;
  readonly #factory: SymbolAnimationInstanceFactory;
  readonly #clock: AnimationClock & AnimationTimeSource;
  #disposed = false;

  public constructor(private readonly options: RuntimeAnimationManagerOptions) {
    this.#clock = (options.timeSource ?? new SystemAnimationClock());
    this.#factory = new SymbolAnimationInstanceFactory(this.#clock);
    this.#scheduler = new SharedAnimationScheduler({
      id: "runtime-symbol-animations",
      timeSource: this.#clock,
      frameDriver: options.frameDriver,
      reducedMotion: options.reducedMotion ?? "no-preference",
      visibility: options.visibility ?? "visible",
      invalidationSink: {
        commit: (batch) => {
          const ids = new Set(batch.invalidations.map(({ targetId }) => targetId));
          for (const entityId of ids)
            try {
              options.onSamples?.(entityId, this.#store.getComposed(entityId));
            } catch (error) {
              this.#report({
                code: "ANIMATION_RENDERER_FAILED",
                severity: "error",
                message: error instanceof Error ? error.message : "Animation renderer failed.",
                entityId,
                timestamp: Date.now()
              });
            }
        }
      }
    });
  }

  public loadDocument(document: Readonly<ScadaDocument>): void {
    this.#assertUsable();
    const nextIds = new Set(document.nodes.map(({ id }) => id));
    for (const [id, controller] of this.#controllers)
      if (!nextIds.has(id)) {
        controller.dispose();
        this.#controllers.delete(id);
      }
    for (const node of document.nodes) {
      const current = this.#controllers.get(node.id);
      if (current?.symbolType === node.symbolType) continue;
      if (current !== undefined) {
        current.dispose();
        this.#controllers.delete(node.id);
      }
      const definition = this.options.symbols.get(node.symbolType);
      if (definition === undefined) continue;
      const animation = resolveSymbolAnimationMetadata(definition);
      if (animation === undefined) continue;
      const resolvedDefinition =
        definition.animation === animation
          ? definition
          : Object.freeze({ ...definition, animation });
      this.#controllers.set(
        node.id,
        new SymbolAnimationController(
          node.id,
          resolvedDefinition,
          this.#scheduler,
          this.#factory,
          this.#store,
          (entry) => { this.#report(entry); }
        )
      );
    }
  }

  public controller(entityId: string): SymbolAnimationController | undefined {
    return this.#controllers.get(entityId);
  }

  public play(entityId: string, slotId: string): void {
    this.#scheduler.start();
    this.#controllers.get(entityId)?.play(slotId);
  }

  public setEntityVisibility(entityId: string, visibility: "visible" | "offscreen"): void {
    const controller = this.#controllers.get(entityId);
    if (visibility === "offscreen") controller?.pause();
    else controller?.resume();
  }

  public restart(entityId: string, slotId: string): void {
    this.#scheduler.start();
    this.#controllers.get(entityId)?.restart(slotId);
  }

  public seek(entityId: string, slotId: string, progress: number): void {
    this.#controllers.get(entityId)?.seek(slotId, progress);
    this.options.onSamples?.(entityId, this.#store.getComposed(entityId));
  }

  public setEntityPlaybackRate(entityId: string, rate: number): void {
    this.#controllers.get(entityId)?.setPlaybackRate(rate);
  }

  public stopEntity(entityId: string): void {
    this.#controllers.get(entityId)?.stop();
    this.options.onSamples?.(entityId, Object.freeze([]));
  }

  public applyBinding(input: SymbolAnimationBindingInput): void {
    const controller = this.#controllers.get(input.entityId);
    if (controller === undefined) {
      this.#report({
        code: "ANIMATION_SYMBOL_NOT_FOUND",
        severity: "warning",
        message: "Binding targets a symbol without animation metadata.",
        entityId: input.entityId,
        timestamp: Date.now()
      });
      return;
    }
    const slots = input.slotId === undefined ? controller.slotIds : [input.slotId];
    if (input.parameter === "enabled") {
      if (input.value === false) controller.stop(input.slotId);
      else if (input.value === true) {
        this.#scheduler.start();
        for (const slot of slots) controller.play(slot);
      } else if (input.value !== true && input.value !== false) this.#invalidBinding(input);
    } else if (input.parameter === "speed") {
      if (typeof input.value === "number" && input.value >= 0)
        controller.setPlaybackRate(input.value);
      else this.#invalidBinding(input);
    } else if (input.parameter === "direction") {
      if (input.value === "reverse") controller.reverse();
      else if (input.value !== "normal") this.#invalidBinding(input);
    } else if (input.parameter === "duration") {
      if (typeof input.value === "number" && input.value >= 0)
        for (const slot of slots) controller.play(slot, { durationMs: input.value });
      else this.#invalidBinding(input);
    } else {
      const property = input.parameter === "flow" ? "flowOffset" : input.parameter;
      if (!controller.playProperty(property, input.value as JsonValue)) this.#invalidBinding(input);
    }
  }

  public pause(): void {
    this.#scheduler.pause();
    for (const controller of this.#controllers.values()) controller.pause();
  }

  public resume(): void {
    for (const controller of this.#controllers.values()) controller.resume();
    this.#scheduler.resume();
  }

  public stop(): void {
    for (const controller of this.#controllers.values()) controller.stop();
    this.#scheduler.stop();
  }

  public setReducedMotion(value: ReducedMotionState): void {
    this.#scheduler.setReducedMotion(value);
  }

  public setVisibility(value: VisibilityState): void {
    this.#scheduler.setVisibility(value);
  }

  public get diagnostics(): readonly SymbolAnimationDiagnostic[] {
    return Object.freeze([...this.#diagnostics]);
  }

  public get valueStoreSize(): number {
    return this.#store.size;
  }

  public get scheduler(): AnimationScheduler {
    return this.#scheduler;
  }

  public dispose(): void {
    if (this.#disposed) return;
    for (const controller of this.#controllers.values()) controller.dispose();
    this.#controllers.clear();
    this.#store.clear();
    this.#scheduler.dispose();
    this.#disposed = true;
  }

  #invalidBinding(input: SymbolAnimationBindingInput): void {
    this.#report({
      code: "ANIMATION_BINDING_INVALID",
      severity: "warning",
      message: `Invalid '${input.parameter}' animation binding.`,
      entityId: input.entityId,
      ...(input.slotId === undefined ? {} : { slotId: input.slotId }),
      timestamp: Date.now()
    });
  }

  #report(diagnostic: SymbolAnimationDiagnostic): void {
    this.#diagnostics.push(Object.freeze(diagnostic));
    this.options.onDiagnostic?.(diagnostic);
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Runtime animation manager is disposed.");
  }
}
