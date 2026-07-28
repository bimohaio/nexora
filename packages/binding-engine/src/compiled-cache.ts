import { BoundedBindingCache, type BindingCacheStatistics } from "./cache.js";
import {
  compileExpression,
  DEFAULT_EXPRESSION_LIMITS,
  EXPRESSION_LANGUAGE_VERSION,
  type ExpressionCompileOptions,
  type ExpressionCompileResult
} from "./expression.js";

function compileKey(
  source: string,
  options: Readonly<ExpressionCompileOptions>,
  registryRevision: number
): string {
  const limits = options.limits ?? DEFAULT_EXPRESSION_LIMITS;
  return JSON.stringify([
    options.language ?? EXPRESSION_LANGUAGE_VERSION,
    registryRevision,
    limits.maximumSourceLength,
    limits.maximumTokenCount,
    limits.maximumAstNodes,
    limits.maximumNestingDepth,
    limits.maximumFunctionArguments,
    limits.maximumStringLength,
    limits.maximumRuntimeReferences,
    limits.maximumEvaluationSteps,
    source
  ]);
}

/**
 * Lifecycle-bound safe-expression compiler cache. Registry owners must increment
 * `registryRevision` whenever function semantics change.
 */
export class CompiledExpressionCache {
  readonly #cache: BoundedBindingCache<ExpressionCompileResult>;

  public constructor(maximumEntries = 2_000) {
    this.#cache = new BoundedBindingCache(maximumEntries);
  }

  public compile(
    source: string,
    options: Readonly<ExpressionCompileOptions> = {},
    registryRevision = 0
  ): ExpressionCompileResult {
    if (!Number.isSafeInteger(registryRevision) || registryRevision < 0)
      throw new RangeError("Registry revision must be a non-negative safe integer.");
    const key = compileKey(source, options, registryRevision);
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;
    const result = compileExpression(source, options);
    this.#cache.set(key, result);
    return result;
  }

  public clear(): void {
    this.#cache.clear();
  }

  public statistics(): BindingCacheStatistics {
    return this.#cache.snapshot();
  }
}
