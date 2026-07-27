import type { BindingEvaluator, BindingEvaluationRequest } from "./contracts.js";

export class PassthroughBindingEvaluator implements BindingEvaluator {
  public evaluate(request: BindingEvaluationRequest): unknown {
    return request.value.value;
  }
}
