import type { HitResult } from "../results/index.js";
import { invertMatrix, type Matrix } from "@web-scada/geometry";
import { CacheError } from "../errors/index.js";
import type { CacheStatistics } from "../types/performance.js";

export interface HitTestRevision {
  readonly revision: number;
  readonly viewportRevision: number;
  readonly documentRevision: number;
}
export class HitTestCache {
  #key: string | undefined;
  #revision: HitTestRevision | undefined;
  #value: readonly HitResult[] | undefined;
  public get(key: string, revision: HitTestRevision): readonly HitResult[] | undefined {
    return this.#key === key && sameRevision(this.#revision, revision) ? this.#value : undefined;
  }
  public set(key: string, revision: HitTestRevision, value: readonly HitResult[]): void {
    this.#key = key;
    this.#revision = { ...revision };
    this.#value = Object.freeze([...value]);
  }
  public invalidate(): void {
    this.#key = undefined;
    this.#revision = undefined;
    this.#value = undefined;
  }
}
const sameRevision = (left: HitTestRevision | undefined, right: HitTestRevision): boolean =>
  left?.revision === right.revision &&
  left.viewportRevision === right.viewportRevision &&
  left.documentRevision === right.documentRevision;

export class RevisionedCache<K, V> {
  readonly #values = new Map<K, V>();
  #revision = 0;
  #hits = 0;
  #misses = 0;
  #evictions = 0;
  #disposed = false;
  public constructor(private readonly capacity = 256) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new CacheError("CACHE_CAPACITY_INVALID", "Cache capacity must be positive.");
  }
  public get(key: K, revision = this.#revision): V | undefined {
    this.#assertUsable();
    this.#synchronizeRevision(revision);
    const value = this.#values.get(key);
    if (value === undefined) this.#misses++;
    else {
      this.#hits++;
      this.#values.delete(key);
      this.#values.set(key, value);
    }
    return value;
  }
  public set(key: K, value: V, revision = this.#revision): void {
    this.#assertUsable();
    this.#synchronizeRevision(revision);
    this.#values.delete(key);
    this.#values.set(key, value);
    if (this.#values.size > this.capacity) {
      const oldest = this.#values.keys().next().value;
      if (oldest !== undefined) {
        this.#values.delete(oldest);
        this.#evictions++;
      }
    }
  }
  public invalidate(revision = this.#revision + 1): void {
    this.#assertUsable();
    this.#values.clear();
    this.#revision = revision;
  }
  public invalidateKey(key: K): boolean {
    this.#assertUsable();
    return this.#values.delete(key);
  }
  public statistics(): CacheStatistics {
    const requests = this.#hits + this.#misses;
    return Object.freeze({
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      size: this.#values.size,
      hitRatio: requests === 0 ? 0 : this.#hits / requests,
      revision: this.#revision
    });
  }
  public dispose(): void {
    this.#values.clear();
    this.#disposed = true;
  }
  #synchronizeRevision(revision: number): void {
    if (revision !== this.#revision) {
      this.#values.clear();
      this.#revision = revision;
    }
  }
  #assertUsable(): void {
    if (this.#disposed) throw new CacheError("CACHE_DISPOSED", "Cache is disposed.");
  }
}

function matrixKey(matrix: Matrix): string {
  return `${matrix.a}:${matrix.b}:${matrix.c}:${matrix.d}:${matrix.e}:${matrix.f}`;
}

export class TransformCache {
  readonly #inverse = new RevisionedCache<string, Matrix>(128);
  public inverse(matrix: Matrix, revision = 0): Matrix {
    const key = matrixKey(matrix);
    const cached = this.#inverse.get(key, revision);
    if (cached !== undefined) return cached;
    const value = Object.freeze(invertMatrix(matrix));
    this.#inverse.set(key, value, revision);
    return value;
  }
  public invalidate(revision?: number): void {
    this.#inverse.invalidate(revision);
  }
  public statistics(): CacheStatistics {
    return this.#inverse.statistics();
  }
  public dispose(): void {
    this.#inverse.dispose();
  }
}

export class InteractionCacheLayer {
  public readonly hitTesting = new RevisionedCache<string, unknown>();
  public readonly coordinates = new RevisionedCache<string, unknown>();
  public readonly viewportTransforms = new RevisionedCache<string, unknown>();
  public readonly selectionLookup = new RevisionedCache<string, boolean>();
  public readonly focusLookup = new RevisionedCache<string, number>();
  public readonly layerVisibility = new RevisionedCache<string, boolean>();
  public readonly transforms = new TransformCache();
  public invalidateAll(revision?: number): void {
    for (const cache of [
      this.hitTesting,
      this.coordinates,
      this.viewportTransforms,
      this.selectionLookup,
      this.focusLookup,
      this.layerVisibility
    ])
      cache.invalidate(revision);
    this.transforms.invalidate(revision);
  }
  public dispose(): void {
    for (const cache of [
      this.hitTesting,
      this.coordinates,
      this.viewportTransforms,
      this.selectionLookup,
      this.focusLookup,
      this.layerVisibility
    ])
      cache.dispose();
    this.transforms.dispose();
  }
}
