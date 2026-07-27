export interface ObjectPoolOptions<T> {
  readonly create: () => T;
  readonly reset: (value: T) => void;
  readonly maximumSize?: number;
  readonly onAllocation?: () => void;
}

export class ObjectPool<T> {
  readonly #available: T[] = [];
  readonly #maximumSize: number;
  #disposed = false;
  public constructor(private readonly options: ObjectPoolOptions<T>) {
    this.#maximumSize = options.maximumSize ?? 64;
  }
  public use<TResult>(operation: (value: T) => TResult): TResult {
    if (this.#disposed) throw new Error("Object pool is disposed.");
    const value = this.#available.pop() ?? this.#allocate();
    try {
      return operation(value);
    } finally {
      this.options.reset(value);
      if (this.#available.length < this.#maximumSize) this.#available.push(value);
    }
  }
  public get retained(): number {
    return this.#available.length;
  }
  public dispose(): void {
    this.#available.length = 0;
    this.#disposed = true;
  }
  #allocate(): T {
    this.options.onAllocation?.();
    return this.options.create();
  }
}

interface MutableVector {
  x: number;
  y: number;
}
interface MutableRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface MutableMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export class InteractionObjectPools {
  readonly #vectors: ObjectPool<MutableVector>;
  readonly #rectangles: ObjectPool<MutableRectangle>;
  readonly #matrices: ObjectPool<MutableMatrix>;
  public constructor(onAllocation?: () => void) {
    this.#vectors = new ObjectPool({
      create: () => ({ x: 0, y: 0 }),
      reset: (value) => {
        value.x = 0;
        value.y = 0;
      },
      ...(onAllocation === undefined ? {} : { onAllocation })
    });
    this.#rectangles = new ObjectPool({
      create: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      reset: (value) => {
        value.x = 0;
        value.y = 0;
        value.width = 0;
        value.height = 0;
      },
      ...(onAllocation === undefined ? {} : { onAllocation })
    });
    this.#matrices = new ObjectPool({
      create: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      reset: (value) => {
        value.a = 1;
        value.b = 0;
        value.c = 0;
        value.d = 1;
        value.e = 0;
        value.f = 0;
      },
      ...(onAllocation === undefined ? {} : { onAllocation })
    });
  }
  public withVector<TResult>(operation: (value: MutableVector) => TResult): TResult {
    return this.#vectors.use(operation);
  }
  public withRectangle<TResult>(operation: (value: MutableRectangle) => TResult): TResult {
    return this.#rectangles.use(operation);
  }
  public withMatrix<TResult>(operation: (value: MutableMatrix) => TResult): TResult {
    return this.#matrices.use(operation);
  }
  public dispose(): void {
    this.#vectors.dispose();
    this.#rectangles.dispose();
    this.#matrices.dispose();
  }
}
