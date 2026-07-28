import type { JsonValue } from "@web-scada/core";

export interface BindingCacheOptions {
  readonly maxCompiledEntries?: number;
  readonly maxResultEntries?: number;
  readonly maxFingerprintDepth?: number;
}

export interface BindingCacheStatistics {
  readonly hits: number;
  readonly misses: number;
  readonly invalidations: number;
  readonly evictions: number;
  readonly size: number;
  readonly peakSize: number;
  readonly capacity: number;
}

function capacity(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0 || resolved > 1_000_000)
    throw new RangeError("Binding cache capacity must be a safe integer from 0 to 1,000,000.");
  return resolved;
}

/** Instance-owned deterministic LRU cache. Values are never exposed as a mutable map. */
export class BoundedBindingCache<T> {
  readonly #capacity: number;
  readonly #entries = new Map<string, T>();
  #hits = 0;
  #misses = 0;
  #invalidations = 0;
  #evictions = 0;
  #peakSize = 0;

  public constructor(maximumEntries: number) {
    this.#capacity = capacity(maximumEntries, 0);
  }

  public get(key: string): T | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) {
      this.#misses += 1;
      return undefined;
    }
    this.#hits += 1;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  public set(key: string, value: T): void {
    if (this.#capacity === 0) return;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
      this.#evictions += 1;
    }
    this.#peakSize = Math.max(this.#peakSize, this.#entries.size);
  }

  public delete(key: string): boolean {
    const deleted = this.#entries.delete(key);
    if (deleted) this.#invalidations += 1;
    return deleted;
  }

  public clear(): void {
    this.#invalidations += this.#entries.size;
    this.#entries.clear();
  }

  public snapshot(): BindingCacheStatistics {
    return Object.freeze({
      hits: this.#hits,
      misses: this.#misses,
      invalidations: this.#invalidations,
      evictions: this.#evictions,
      size: this.#entries.size,
      peakSize: this.#peakSize,
      capacity: this.#capacity
    });
  }
}

function canonical(value: JsonValue, depth: number, maximumDepth: number): string {
  if (depth > maximumDepth) throw new RangeError("Binding fingerprint depth limit exceeded.");
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Binding fingerprints require finite numbers.");
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (Array.isArray(value)) {
    const entries = value as readonly JsonValue[];
    return `[${entries.map((entry) => canonical(entry, depth + 1, maximumDepth)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonical(record[key] as JsonValue, depth + 1, maximumDepth)}`
    )
    .join(",")}}`;
}

/** Stable, property-order-independent fingerprint for normalized JSON-safe definitions. */
export function createBindingDefinitionFingerprint(
  definition: JsonValue,
  maximumDepth = 32
): string {
  if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 1 || maximumDepth > 256)
    throw new RangeError("Fingerprint depth must be a safe integer from 1 to 256.");
  const text = canonical(definition, 0, maximumDepth);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function resolveBindingCacheOptions(
  options: Readonly<BindingCacheOptions> = {}
): Required<BindingCacheOptions> {
  return Object.freeze({
    maxCompiledEntries: capacity(options.maxCompiledEntries, 2_000),
    maxResultEntries: capacity(options.maxResultEntries, 10_000),
    maxFingerprintDepth: capacity(options.maxFingerprintDepth, 32)
  });
}
