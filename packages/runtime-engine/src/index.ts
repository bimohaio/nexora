export type RuntimeDataType = "boolean" | "number" | "string" | "json";
export type DataQuality = "good" | "uncertain" | "bad" | "offline" | "unknown";

export interface RuntimeValue {
  readonly tagId: string;
  readonly value: unknown;
  readonly dataType: RuntimeDataType;
  readonly quality: DataQuality;
  readonly timestamp: string;
}

export interface TagStore {
  get(tagId: string): RuntimeValue | undefined;
  getAll(): readonly RuntimeValue[];
  subscribe(listener: (value: RuntimeValue) => void): () => void;
}

export interface DataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(tagIds: readonly string[], listener: (value: RuntimeValue) => void): () => void;
}

export interface BindingEvaluationRequest {
  readonly value: RuntimeValue;
  readonly targetProperty: string;
}

export interface BindingEvaluator {
  evaluate(request: BindingEvaluationRequest): unknown;
}
