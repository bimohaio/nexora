import type { JsonValue } from "@web-scada/core";
import type { BindingDiagnostic } from "./contracts.js";

interface FormatBase {
  readonly prefix?: string;
  readonly suffix?: string;
}
export interface NumberFormatDefinition extends FormatBase {
  readonly type: "number";
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
  readonly unit?: string;
  readonly nullText?: string;
}
export interface TextFormatDefinition extends FormatBase {
  readonly type: "text";
  readonly nullText?: string;
  readonly trueText?: string;
  readonly falseText?: string;
}
export interface BooleanFormatDefinition extends FormatBase {
  readonly type: "boolean";
  readonly trueText: string;
  readonly falseText: string;
}
export interface IdentityFormatDefinition {
  readonly type: "identity";
}
export type ValueFormatDefinition =
  | NumberFormatDefinition
  | TextFormatDefinition
  | BooleanFormatDefinition
  | IdentityFormatDefinition;

export interface FormattingLimits {
  readonly maximumPrefixLength: number;
  readonly maximumSuffixLength: number;
  readonly maximumUnitLength: number;
  readonly maximumOutputLength: number;
  readonly maximumFractionDigits: number;
}
export const DEFAULT_FORMATTING_LIMITS: Readonly<FormattingLimits> = Object.freeze({
  maximumPrefixLength: 128,
  maximumSuffixLength: 128,
  maximumUnitLength: 64,
  maximumOutputLength: 4096,
  maximumFractionDigits: 20
});
export interface FormattingContext {
  readonly locale: string;
  readonly limits?: Readonly<FormattingLimits>;
}
export type FormattingResult =
  | {
      readonly status: "formatted" | "unchanged";
      readonly value: JsonValue;
      readonly diagnostics: readonly BindingDiagnostic[];
    }
  | { readonly status: "invalid" | "error"; readonly diagnostics: readonly BindingDiagnostic[] };

function diagnostic(code: BindingDiagnostic["code"], message: string): BindingDiagnostic {
  return Object.freeze({ code, severity: "error", message, recoverable: true });
}
function lengthDiagnostic(
  value: string | undefined,
  maximum: number,
  code: BindingDiagnostic["code"],
  label: string
): BindingDiagnostic | undefined {
  return value !== undefined && value.length > maximum
    ? diagnostic(code, `${label} exceeds the ${maximum} character limit.`)
    : undefined;
}

export function validateValueFormat(
  definition: Readonly<ValueFormatDefinition>,
  limits: Readonly<FormattingLimits> = DEFAULT_FORMATTING_LIMITS
): readonly BindingDiagnostic[] {
  const diagnostics: BindingDiagnostic[] = [];
  if (!["number", "text", "boolean", "identity"].includes(definition.type))
    return Object.freeze([
      diagnostic("BINDING_FORMAT_UNSUPPORTED_TYPE", "Unsupported formatter type.")
    ]);
  if (definition.type === "identity") return Object.freeze([]);
  for (const entry of [
    lengthDiagnostic(
      definition.prefix,
      limits.maximumPrefixLength,
      "BINDING_FORMAT_PREFIX_TOO_LONG",
      "Prefix"
    ),
    lengthDiagnostic(
      definition.suffix,
      limits.maximumSuffixLength,
      "BINDING_FORMAT_SUFFIX_TOO_LONG",
      "Suffix"
    )
  ])
    if (entry !== undefined) diagnostics.push(entry);
  if (definition.type === "number") {
    const minimum = definition.minimumFractionDigits ?? 0;
    const maximum = definition.maximumFractionDigits ?? Math.max(minimum, 3);
    if (
      !Number.isInteger(minimum) ||
      !Number.isInteger(maximum) ||
      minimum < 0 ||
      maximum < minimum ||
      maximum > limits.maximumFractionDigits
    )
      diagnostics.push(
        diagnostic("BINDING_FORMAT_INVALID_DIGIT_RANGE", "Invalid fraction digit range.")
      );
    const unit = lengthDiagnostic(
      definition.unit,
      limits.maximumUnitLength,
      "BINDING_FORMAT_UNIT_TOO_LONG",
      "Unit"
    );
    if (unit !== undefined) diagnostics.push(unit);
  }
  if (
    definition.type === "boolean" &&
    (typeof definition.trueText !== "string" || typeof definition.falseText !== "string")
  )
    diagnostics.push(
      diagnostic("BINDING_FORMAT_INVALID_DEFINITION", "Boolean labels must be strings.")
    );
  return Object.freeze(diagnostics);
}

function composed(
  body: string,
  definition: FormatBase,
  limits: Readonly<FormattingLimits>
): FormattingResult {
  const output = `${definition.prefix ?? ""}${body}${definition.suffix ?? ""}`;
  if (output.length > limits.maximumOutputLength)
    return Object.freeze({
      status: "invalid",
      diagnostics: Object.freeze([
        diagnostic(
          "BINDING_FORMAT_OUTPUT_TOO_LONG",
          `Formatted output exceeds the ${limits.maximumOutputLength} character limit.`
        )
      ])
    });
  return Object.freeze({ status: "formatted", value: output, diagnostics: Object.freeze([]) });
}

export function formatBindingValue(
  value: JsonValue,
  definition: Readonly<ValueFormatDefinition>,
  context: Readonly<FormattingContext>
): FormattingResult {
  const limits = context.limits ?? DEFAULT_FORMATTING_LIMITS;
  const diagnostics = validateValueFormat(definition, limits);
  if (diagnostics.length > 0) return Object.freeze({ status: "invalid", diagnostics });
  try {
    if (definition.type === "identity")
      return Object.freeze({ status: "unchanged", value, diagnostics: Object.freeze([]) });
    if (definition.type === "number") {
      if (value === null && definition.nullText !== undefined)
        return composed(definition.nullText, definition, limits);
      if (typeof value !== "number")
        return Object.freeze({
          status: "invalid",
          diagnostics: Object.freeze([
            diagnostic("BINDING_FORMAT_INPUT_TYPE_MISMATCH", "Number formatter requires a number.")
          ])
        });
      if (!Number.isFinite(value))
        return Object.freeze({
          status: "invalid",
          diagnostics: Object.freeze([
            diagnostic("BINDING_FORMAT_NON_FINITE_NUMBER", "Number must be finite.")
          ])
        });
      const formatter = new Intl.NumberFormat(context.locale, {
        ...(definition.minimumFractionDigits === undefined
          ? {}
          : { minimumFractionDigits: definition.minimumFractionDigits }),
        ...(definition.maximumFractionDigits === undefined
          ? {}
          : { maximumFractionDigits: definition.maximumFractionDigits }),
        useGrouping: definition.useGrouping ?? false
      });
      const unit = definition.unit === undefined ? "" : ` ${definition.unit}`;
      return composed(
        `${formatter.format(Object.is(value, -0) ? 0 : value)}${unit}`,
        definition,
        limits
      );
    }
    if (definition.type === "boolean") {
      if (typeof value !== "boolean")
        return Object.freeze({
          status: "invalid",
          diagnostics: Object.freeze([
            diagnostic(
              "BINDING_FORMAT_INPUT_TYPE_MISMATCH",
              "Boolean formatter requires a boolean."
            )
          ])
        });
      return composed(value ? definition.trueText : definition.falseText, definition, limits);
    }
    let text: string;
    if (value === null) {
      if (definition.nullText === undefined)
        return Object.freeze({
          status: "invalid",
          diagnostics: Object.freeze([
            diagnostic("BINDING_FORMAT_NULL_VALUE", "Text formatter requires explicit nullText.")
          ])
        });
      text = definition.nullText;
    } else if (typeof value === "string" || typeof value === "number") text = String(value);
    else if (typeof value === "boolean")
      text = value ? (definition.trueText ?? "true") : (definition.falseText ?? "false");
    else
      return Object.freeze({
        status: "invalid",
        diagnostics: Object.freeze([
          diagnostic(
            "BINDING_FORMAT_INPUT_TYPE_MISMATCH",
            "Text formatter accepts only primitive values."
          )
        ])
      });
    return composed(text, definition, limits);
  } catch {
    return Object.freeze({
      status: "error",
      diagnostics: Object.freeze([
        diagnostic("BINDING_FORMAT_EVALUATION_ERROR", "Formatting failed unexpectedly.")
      ])
    });
  }
}
