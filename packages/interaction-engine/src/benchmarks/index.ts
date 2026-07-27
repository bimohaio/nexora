export const INTERACTION_BENCHMARK_SIZES = Object.freeze([100, 1_000, 5_000, 10_000, 20_000]);

export interface InteractionBenchmarkResult {
  readonly name: string;
  readonly size: number;
  readonly iterations: number;
  readonly totalMs: number;
  readonly averageMs: number;
  readonly withinFrameBudget: boolean;
  readonly memoryBytes?: number;
}

export interface InteractionBenchmarkOptions {
  readonly iterations?: number;
  readonly frameBudgetMs?: number;
  readonly now?: () => number;
  readonly memory?: () => number | undefined;
}

export function runInteractionBenchmark(
  name: string,
  size: number,
  operation: () => void,
  options: InteractionBenchmarkOptions = {}
): InteractionBenchmarkResult {
  const iterations = options.iterations ?? 100;
  const now = options.now ?? (() => performance.now());
  const beforeMemory = options.memory?.();
  const started = now();
  for (let iteration = 0; iteration < iterations; iteration++) operation();
  const totalMs = Math.max(0, now() - started);
  const averageMs = totalMs / iterations;
  const afterMemory = options.memory?.();
  return Object.freeze({
    name,
    size,
    iterations,
    totalMs,
    averageMs,
    withinFrameBudget: averageMs <= (options.frameBudgetMs ?? 16),
    ...(beforeMemory === undefined || afterMemory === undefined
      ? {}
      : { memoryBytes: Math.max(0, afterMemory - beforeMemory) })
  });
}
