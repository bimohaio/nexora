import type { PropertyBinding } from "@web-scada/core";
import type { BindingEvaluationResult } from "./contracts.js";
import {
  evaluateDirectBinding,
  type DirectBindingDefinition,
  type DirectBindingEvaluationContext
} from "./direct.js";
import {
  evaluateExpressionBinding,
  type ExpressionBindingDefinition,
  type ExpressionBindingEvaluationContext
} from "./expression.js";
import { transformBindingEvaluationResult, type BindingTransformContext } from "./transforms.js";

export type TransformedDirectBindingContext = DirectBindingEvaluationContext &
  BindingTransformContext;
export type TransformedExpressionBindingContext = ExpressionBindingEvaluationContext &
  BindingTransformContext;

/** Evaluates a direct source once, then maps, formats, and validates its target. */
export function evaluateTransformedDirectBinding(
  definition: Readonly<DirectBindingDefinition>,
  context: Readonly<TransformedDirectBindingContext>
): BindingEvaluationResult {
  const source = evaluateDirectBinding(definition, {
    ...context,
    policies: { ...context.policies, deferTargetValidation: true }
  });
  return transformBindingEvaluationResult(source, definition, context);
}

/** Evaluates an expression once, then maps, formats, and validates its target. */
export function evaluateTransformedExpressionBinding(
  definition: Readonly<ExpressionBindingDefinition>,
  context: Readonly<TransformedExpressionBindingContext>
): BindingEvaluationResult {
  const source = evaluateExpressionBinding(definition, {
    ...context,
    deferTargetValidation: true
  });
  return transformBindingEvaluationResult(source, definition, context);
}

export function hasBindingTransforms(definition: Readonly<PropertyBinding>): boolean {
  return definition.transformation !== undefined || definition.formatter !== undefined;
}
