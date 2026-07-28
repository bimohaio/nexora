import { isJsonValue, type JsonValue, type PropertyBinding } from "@web-scada/core";
import type { DataQuality, RuntimeSnapshot } from "@web-scada/runtime-engine";
import type {
  BindingDependency,
  BindingDiagnostic,
  BindingDiagnosticCode,
  BindingEvaluationResult
} from "./contracts.js";
import { isBindingTargetValueCompatible, type RuntimeBindingValueReader } from "./direct.js";
import type { BindingTypeRegistry } from "./registry.js";
import { getBindingOwner } from "./validation.js";

export const EXPRESSION_LANGUAGE_VERSION = "scada-expression-v1" as const;
export type ExpressionLanguageVersion = typeof EXPRESSION_LANGUAGE_VERSION;

export interface ExpressionLanguageLimits {
  readonly maximumSourceLength: number;
  readonly maximumTokenCount: number;
  readonly maximumAstNodes: number;
  readonly maximumNestingDepth: number;
  readonly maximumFunctionArguments: number;
  readonly maximumStringLength: number;
  readonly maximumRuntimeReferences: number;
  readonly maximumEvaluationSteps: number;
}

export const DEFAULT_EXPRESSION_LIMITS: Readonly<ExpressionLanguageLimits> = Object.freeze({
  maximumSourceLength: 4096,
  maximumTokenCount: 1024,
  maximumAstNodes: 512,
  maximumNestingDepth: 32,
  maximumFunctionArguments: 32,
  maximumStringLength: 2048,
  maximumRuntimeReferences: 128,
  maximumEvaluationSteps: 2048
});

export interface ExpressionSourceRange {
  /** Zero-based UTF-16 offset, inclusive. */
  readonly start: number;
  /** Zero-based UTF-16 offset, exclusive. */
  readonly end: number;
}

export type ExpressionTokenKind =
  | "number"
  | "string"
  | "boolean"
  | "null"
  | "identifier"
  | "runtime-reference"
  | "left-parenthesis"
  | "right-parenthesis"
  | "comma"
  | "question"
  | "colon"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "percent"
  | "bang"
  | "and-and"
  | "or-or"
  | "equal-equal"
  | "bang-equal"
  | "less"
  | "less-equal"
  | "greater"
  | "greater-equal"
  | "eof";

export interface ExpressionToken {
  readonly kind: ExpressionTokenKind;
  readonly lexeme: string;
  readonly value?: JsonValue;
  readonly range: ExpressionSourceRange;
}

export type UnaryExpressionOperator = "!" | "+" | "-";
export type BinaryExpressionOperator =
  "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "&&" | "||";

interface ExpressionNodeBase {
  readonly range: ExpressionSourceRange;
}
export interface LiteralExpressionNode extends ExpressionNodeBase {
  readonly kind: "literal";
  readonly value: JsonValue;
}
export interface RuntimeReferenceExpressionNode extends ExpressionNodeBase {
  readonly kind: "runtime-reference";
  readonly key: string;
}
export interface IdentifierExpressionNode extends ExpressionNodeBase {
  readonly kind: "identifier";
  readonly name: string;
}
export interface UnaryExpressionNode extends ExpressionNodeBase {
  readonly kind: "unary";
  readonly operator: UnaryExpressionOperator;
  readonly operand: ExpressionNode;
}
export interface BinaryExpressionNode extends ExpressionNodeBase {
  readonly kind: "binary";
  readonly operator: BinaryExpressionOperator;
  readonly left: ExpressionNode;
  readonly right: ExpressionNode;
}
export interface ConditionalExpressionNode extends ExpressionNodeBase {
  readonly kind: "conditional";
  readonly condition: ExpressionNode;
  readonly whenTrue: ExpressionNode;
  readonly whenFalse: ExpressionNode;
}
export interface CallExpressionNode extends ExpressionNodeBase {
  readonly kind: "call";
  readonly name: string;
  readonly arguments: readonly ExpressionNode[];
}
export type ExpressionNode =
  | LiteralExpressionNode
  | RuntimeReferenceExpressionNode
  | IdentifierExpressionNode
  | UnaryExpressionNode
  | BinaryExpressionNode
  | ConditionalExpressionNode
  | CallExpressionNode;

export interface ExpressionComplexity {
  readonly sourceLength: number;
  readonly tokenCount: number;
  readonly astNodes: number;
  readonly maximumDepth: number;
  readonly runtimeReferences: number;
}

export interface CompiledExpression {
  readonly language: ExpressionLanguageVersion;
  readonly source: string;
  readonly ast: ExpressionNode;
  readonly dependencies: readonly BindingDependency[];
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly complexity: ExpressionComplexity;
}

export type ExpressionTokenizeResult =
  | { readonly success: true; readonly tokens: readonly ExpressionToken[] }
  | { readonly success: false; readonly diagnostics: readonly BindingDiagnostic[] };
export type ExpressionParseResult =
  | { readonly success: true; readonly ast: ExpressionNode; readonly astNodes: number }
  | { readonly success: false; readonly diagnostics: readonly BindingDiagnostic[] };
export type ExpressionCompileResult =
  | { readonly success: true; readonly compiled: CompiledExpression }
  | { readonly success: false; readonly diagnostics: readonly BindingDiagnostic[] };

export interface ExpressionFunctionDefinition {
  readonly name: string;
  readonly minimumArguments: number;
  readonly maximumArguments: number;
  readonly evaluate: (arguments_: readonly JsonValue[]) => JsonValue;
}

export class DuplicateExpressionFunctionError extends Error {
  public constructor(public readonly functionName: string) {
    super(`Expression function is already registered: ${functionName}`);
    this.name = "DuplicateExpressionFunctionError";
  }
}

export class ExpressionFunctionRegistry {
  readonly #definitions = new Map<string, ExpressionFunctionDefinition>();

  public register(definition: Readonly<ExpressionFunctionDefinition>): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(definition.name))
      throw new TypeError("Expression function name is invalid.");
    if (
      !Number.isSafeInteger(definition.minimumArguments) ||
      !Number.isSafeInteger(definition.maximumArguments) ||
      definition.minimumArguments < 0 ||
      definition.maximumArguments < definition.minimumArguments
    )
      throw new TypeError("Expression function arity is invalid.");
    if (this.#definitions.has(definition.name))
      throw new DuplicateExpressionFunctionError(definition.name);
    this.#definitions.set(definition.name, Object.freeze({ ...definition }));
  }

  public get(name: string): ExpressionFunctionDefinition | undefined {
    return this.#definitions.get(name);
  }

  public list(): readonly ExpressionFunctionDefinition[] {
    return Object.freeze(
      [...this.#definitions.values()].sort((left, right) => left.name.localeCompare(right.name))
    );
  }
}

function finiteNumber(value: JsonValue, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError(`${name} requires finite numbers.`);
  return value;
}

function numericFunction(
  name: string,
  minimumArguments: number,
  maximumArguments: number,
  operation: (values: readonly number[]) => number
): ExpressionFunctionDefinition {
  return {
    name,
    minimumArguments,
    maximumArguments,
    evaluate(arguments_) {
      const result = operation(arguments_.map((value) => finiteNumber(value, name)));
      if (!Number.isFinite(result)) throw new TypeError(`${name} returned a non-finite number.`);
      return result;
    }
  };
}

function numberAt(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new TypeError("Expression function argument is missing.");
  return value;
}

export function createDefaultExpressionFunctionRegistry(): ExpressionFunctionRegistry {
  const registry = new ExpressionFunctionRegistry();
  for (const definition of [
    numericFunction("abs", 1, 1, (values) => Math.abs(numberAt(values, 0))),
    numericFunction("min", 1, 32, (values) => Math.min(...values)),
    numericFunction("max", 1, 32, (values) => Math.max(...values)),
    numericFunction("clamp", 3, 3, (values) =>
      Math.min(Math.max(numberAt(values, 0), numberAt(values, 1)), numberAt(values, 2))
    ),
    numericFunction("round", 1, 1, (values) => Math.round(numberAt(values, 0))),
    numericFunction("floor", 1, 1, (values) => Math.floor(numberAt(values, 0))),
    numericFunction("ceil", 1, 1, (values) => Math.ceil(numberAt(values, 0)))
  ])
    registry.register(definition);
  registry.register({
    name: "coalesce",
    minimumArguments: 1,
    maximumArguments: 32,
    evaluate: (arguments_) => arguments_.find((value) => value !== null) ?? null
  });
  registry.register({
    name: "if",
    minimumArguments: 3,
    maximumArguments: 3,
    evaluate: ([condition, whenTrue, whenFalse]) => {
      if (typeof condition !== "boolean") throw new TypeError("if requires a boolean condition.");
      return condition ? (whenTrue as JsonValue) : (whenFalse as JsonValue);
    }
  });
  return registry;
}

function expressionDiagnostic(
  code: BindingDiagnosticCode,
  message: string,
  range: ExpressionSourceRange,
  context: Readonly<Record<string, JsonValue>> = {}
): BindingDiagnostic {
  return Object.freeze({
    code,
    severity: "error",
    message,
    recoverable: true,
    sourceRange: Object.freeze({ ...range }),
    context: Object.freeze({ ...context })
  });
}

const FORBIDDEN_EXPRESSION_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function cloneExpressionJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneExpressionJson));
  const record = value as Readonly<Record<string, JsonValue>>;
  const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(record).sort()) {
    if (FORBIDDEN_EXPRESSION_KEYS.has(key)) throw new TypeError("Unsafe expression value key.");
    output[key] = cloneExpressionJson(record[key] as JsonValue);
  }
  return Object.freeze(output);
}

function token(
  kind: ExpressionTokenKind,
  source: string,
  start: number,
  end: number,
  value?: JsonValue
): ExpressionToken {
  return Object.freeze({
    kind,
    lexeme: source.slice(start, end),
    range: Object.freeze({ start, end }),
    ...(value === undefined ? {} : { value })
  });
}

export function tokenizeExpression(
  source: string,
  limits: Readonly<ExpressionLanguageLimits> = DEFAULT_EXPRESSION_LIMITS
): ExpressionTokenizeResult {
  if (source.length > limits.maximumSourceLength)
    return {
      success: false,
      diagnostics: [
        expressionDiagnostic(
          "EXPRESSION_SOURCE_TOO_LONG",
          "Expression source exceeds the configured length limit.",
          { start: 0, end: source.length },
          { maximumSourceLength: limits.maximumSourceLength }
        )
      ]
    };
  const tokens: ExpressionToken[] = [];
  const fail = (
    code: BindingDiagnosticCode,
    message: string,
    start: number,
    end: number
  ): ExpressionTokenizeResult => ({
    success: false,
    diagnostics: [expressionDiagnostic(code, message, { start, end })]
  });
  const push = (entry: ExpressionToken): ExpressionTokenizeResult | undefined => {
    tokens.push(entry);
    return tokens.length > limits.maximumTokenCount
      ? fail(
          "EXPRESSION_TOKEN_LIMIT_EXCEEDED",
          "Expression token count exceeds the configured limit.",
          entry.range.start,
          entry.range.end
        )
      : undefined;
  };
  let index = 0;
  while (index < source.length) {
    const character = source.charAt(index);
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    const start = index;
    const pairs: Readonly<Record<string, ExpressionTokenKind>> = {
      "&&": "and-and",
      "||": "or-or",
      "==": "equal-equal",
      "!=": "bang-equal",
      "<=": "less-equal",
      ">=": "greater-equal"
    };
    const pair = source.slice(index, index + 2);
    const pairKind = pairs[pair];
    if (pairKind !== undefined) {
      index += 2;
      const exceeded = push(token(pairKind, source, start, index));
      if (exceeded !== undefined) return exceeded;
      continue;
    }
    const singles: Readonly<Record<string, ExpressionTokenKind>> = {
      "(": "left-parenthesis",
      ")": "right-parenthesis",
      ",": "comma",
      "?": "question",
      ":": "colon",
      "+": "plus",
      "-": "minus",
      "*": "star",
      "/": "slash",
      "%": "percent",
      "!": "bang",
      "<": "less",
      ">": "greater"
    };
    const singleKind = singles[character];
    if (singleKind !== undefined) {
      index += 1;
      const exceeded = push(token(singleKind, source, start, index));
      if (exceeded !== undefined) return exceeded;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const current = source.charAt(index);
        if (current === quote) {
          index += 1;
          closed = true;
          break;
        }
        if (current === "\\") {
          const escaped = source[index + 1];
          const escapes: Readonly<Record<string, string>> = {
            "\\": "\\",
            '"': '"',
            "'": "'",
            n: "\n",
            r: "\r",
            t: "\t"
          };
          if (escaped === undefined || escapes[escaped] === undefined)
            return fail(
              "EXPRESSION_INVALID_ESCAPE",
              "Expression string contains an invalid escape.",
              index,
              Math.min(index + 2, source.length)
            );
          value += escapes[escaped];
          index += 2;
        } else {
          value += current;
          index += 1;
        }
        if (value.length > limits.maximumStringLength)
          return fail(
            "EXPRESSION_STRING_LIMIT_EXCEEDED",
            "Expression string exceeds the configured length limit.",
            start,
            index
          );
      }
      if (!closed)
        return fail(
          "EXPRESSION_UNTERMINATED_STRING",
          "Expression string is unterminated.",
          start,
          source.length
        );
      const exceeded = push(token("string", source, start, index, value));
      if (exceeded !== undefined) return exceeded;
      continue;
    }
    if (character === "$") {
      index += 1;
      const keyStart = index;
      while (index < source.length && /[A-Za-z0-9_.-]/u.test(source.charAt(index))) index += 1;
      const key = source.slice(keyStart, index);
      const segments = key.split(".");
      if (
        key === "" ||
        key.startsWith(".") ||
        key.endsWith(".") ||
        segments.some(
          (segment) =>
            segment === "" ||
            !/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(segment) ||
            ["__proto__", "prototype", "constructor"].includes(segment)
        )
      )
        return fail(
          "EXPRESSION_INVALID_RUNTIME_REFERENCE",
          "Runtime reference is malformed or contains a forbidden segment.",
          start,
          index
        );
      const exceeded = push(token("runtime-reference", source, start, index, key));
      if (exceeded !== undefined) return exceeded;
      continue;
    }
    if (/[0-9]/u.test(character)) {
      const numberMatch = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/u.exec(source.slice(index));
      if (numberMatch === null)
        return fail(
          "EXPRESSION_INVALID_NUMBER",
          "Expression number is malformed.",
          start,
          index + 1
        );
      index += numberMatch[0].length;
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value))
        return fail("EXPRESSION_INVALID_NUMBER", "Expression number must be finite.", start, index);
      const exceeded = push(token("number", source, start, index, value));
      if (exceeded !== undefined) return exceeded;
      continue;
    }
    if (/[A-Za-z_]/u.test(character)) {
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/u.test(source.charAt(index))) index += 1;
      const lexeme = source.slice(start, index);
      const kind: ExpressionTokenKind =
        lexeme === "true" || lexeme === "false"
          ? "boolean"
          : lexeme === "null"
            ? "null"
            : "identifier";
      const value = kind === "boolean" ? lexeme === "true" : kind === "null" ? null : undefined;
      const exceeded = push(token(kind, source, start, index, value));
      if (exceeded !== undefined) return exceeded;
      continue;
    }
    return fail(
      "EXPRESSION_INVALID_CHARACTER",
      "Expression contains an unsupported character.",
      start,
      start + 1
    );
  }
  tokens.push(token("eof", source, source.length, source.length));
  return { success: true, tokens: Object.freeze(tokens) };
}

class ParseFailure extends Error {
  public constructor(public readonly diagnostic: BindingDiagnostic) {
    super(diagnostic.message);
  }
}

class ExpressionParser {
  readonly #tokens: readonly ExpressionToken[];
  readonly #limits: Readonly<ExpressionLanguageLimits>;
  #cursor = 0;
  #nodes = 0;
  #depth = 0;

  public constructor(
    tokens: readonly ExpressionToken[],
    limits: Readonly<ExpressionLanguageLimits>
  ) {
    this.#tokens = tokens;
    this.#limits = limits;
  }

  public parse(): ExpressionParseResult {
    try {
      const ast = this.#conditional();
      const current = this.#current();
      if (current.kind !== "eof")
        this.#raise(
          "EXPRESSION_UNEXPECTED_TOKEN",
          "Unexpected trailing expression token.",
          current
        );
      return { success: true, ast, astNodes: this.#nodes };
    } catch (error) {
      if (error instanceof ParseFailure) return { success: false, diagnostics: [error.diagnostic] };
      throw error;
    }
  }

  #node<T extends ExpressionNode>(node: T): T {
    this.#nodes += 1;
    if (this.#nodes > this.#limits.maximumAstNodes)
      this.#raise(
        "EXPRESSION_AST_LIMIT_EXCEEDED",
        "Expression AST exceeds the configured node limit.",
        this.#current()
      );
    Object.freeze(node.range);
    return Object.freeze(node);
  }

  #nested<T>(operation: () => T): T {
    this.#depth += 1;
    if (this.#depth > this.#limits.maximumNestingDepth)
      this.#raise(
        "EXPRESSION_NESTING_LIMIT_EXCEEDED",
        "Expression nesting exceeds the configured limit.",
        this.#current()
      );
    try {
      return operation();
    } finally {
      this.#depth -= 1;
    }
  }

  #conditional(): ExpressionNode {
    const condition = this.#or();
    if (!this.#match("question")) return condition;
    return this.#nested(() => {
      const whenTrue = this.#conditional();
      this.#consume("colon", "EXPRESSION_EXPECTED_COLON", "Expected ':' in conditional.");
      const whenFalse = this.#conditional();
      return this.#node({
        kind: "conditional",
        condition,
        whenTrue,
        whenFalse,
        range: { start: condition.range.start, end: whenFalse.range.end }
      });
    });
  }

  #or(): ExpressionNode {
    return this.#binary(() => this.#and(), [["or-or", "||"]]);
  }
  #and(): ExpressionNode {
    return this.#binary(() => this.#equality(), [["and-and", "&&"]]);
  }
  #equality(): ExpressionNode {
    return this.#binary(
      () => this.#comparison(),
      [
        ["equal-equal", "=="],
        ["bang-equal", "!="]
      ]
    );
  }
  #comparison(): ExpressionNode {
    return this.#binary(
      () => this.#additive(),
      [
        ["less", "<"],
        ["less-equal", "<="],
        ["greater", ">"],
        ["greater-equal", ">="]
      ]
    );
  }
  #additive(): ExpressionNode {
    return this.#binary(
      () => this.#multiplicative(),
      [
        ["plus", "+"],
        ["minus", "-"]
      ]
    );
  }
  #multiplicative(): ExpressionNode {
    return this.#binary(
      () => this.#unary(),
      [
        ["star", "*"],
        ["slash", "/"],
        ["percent", "%"]
      ]
    );
  }

  #binary(
    operand: () => ExpressionNode,
    operators: readonly (readonly [ExpressionTokenKind, BinaryExpressionOperator])[]
  ): ExpressionNode {
    let expression = operand();
    for (;;) {
      const operator = operators.find(([kind]) => this.#current().kind === kind);
      if (operator === undefined) return expression;
      this.#advance();
      const right = operand();
      expression = this.#node({
        kind: "binary",
        operator: operator[1],
        left: expression,
        right,
        range: { start: expression.range.start, end: right.range.end }
      });
    }
  }

  #unary(): ExpressionNode {
    const current = this.#current();
    const operator =
      current.kind === "bang"
        ? "!"
        : current.kind === "plus"
          ? "+"
          : current.kind === "minus"
            ? "-"
            : undefined;
    if (operator === undefined) return this.#primary();
    this.#advance();
    return this.#nested(() => {
      const operand = this.#unary();
      return this.#node({
        kind: "unary",
        operator,
        operand,
        range: { start: current.range.start, end: operand.range.end }
      });
    });
  }

  #primary(): ExpressionNode {
    const current = this.#current();
    if (
      current.kind === "number" ||
      current.kind === "string" ||
      current.kind === "boolean" ||
      current.kind === "null"
    ) {
      this.#advance();
      return this.#node({
        kind: "literal",
        value: current.value as JsonValue,
        range: current.range
      });
    }
    if (current.kind === "runtime-reference") {
      this.#advance();
      return this.#node({
        kind: "runtime-reference",
        key: current.value as string,
        range: current.range
      });
    }
    if (current.kind === "identifier") {
      this.#advance();
      if (!this.#match("left-parenthesis"))
        return this.#node({ kind: "identifier", name: current.lexeme, range: current.range });
      return this.#nested(() => {
        const arguments_: ExpressionNode[] = [];
        if (this.#current().kind !== "right-parenthesis") {
          do {
            if (arguments_.length >= this.#limits.maximumFunctionArguments)
              this.#raise(
                "EXPRESSION_INVALID_FUNCTION_ARITY",
                "Function argument count exceeds the configured limit.",
                this.#current()
              );
            arguments_.push(this.#conditional());
          } while (this.#match("comma"));
        }
        const close = this.#consume(
          "right-parenthesis",
          "EXPRESSION_EXPECTED_RIGHT_PAREN",
          "Expected ')' after function arguments."
        );
        return this.#node({
          kind: "call",
          name: current.lexeme,
          arguments: Object.freeze(arguments_),
          range: { start: current.range.start, end: close.range.end }
        });
      });
    }
    if (this.#match("left-parenthesis")) {
      return this.#nested(() => {
        const expression = this.#conditional();
        this.#consume(
          "right-parenthesis",
          "EXPRESSION_EXPECTED_RIGHT_PAREN",
          "Expected ')' after expression."
        );
        return expression;
      });
    }
    this.#raise("EXPRESSION_EXPECTED_EXPRESSION", "Expected an expression.", current);
  }

  #current(): ExpressionToken {
    const current = this.#tokens[this.#cursor];
    if (current === undefined) throw new Error("Expression token stream has no EOF token.");
    return current;
  }
  #advance(): ExpressionToken {
    const current = this.#current();
    if (current.kind !== "eof") this.#cursor += 1;
    return current;
  }
  #match(kind: ExpressionTokenKind): boolean {
    if (this.#current().kind !== kind) return false;
    this.#advance();
    return true;
  }
  #consume(
    kind: ExpressionTokenKind,
    code: BindingDiagnosticCode,
    message: string
  ): ExpressionToken {
    if (this.#current().kind !== kind) this.#raise(code, message, this.#current());
    return this.#advance();
  }
  #raise(code: BindingDiagnosticCode, message: string, token_: ExpressionToken): never {
    throw new ParseFailure(expressionDiagnostic(code, message, token_.range));
  }
}

export function parseExpression(
  tokens: readonly ExpressionToken[],
  limits: Readonly<ExpressionLanguageLimits> = DEFAULT_EXPRESSION_LIMITS
): ExpressionParseResult {
  return new ExpressionParser(tokens, limits).parse();
}

function walkExpression(
  node: ExpressionNode,
  visitor: (node: ExpressionNode, depth: number) => void,
  depth = 1
): void {
  visitor(node, depth);
  if (node.kind === "unary") walkExpression(node.operand, visitor, depth + 1);
  else if (node.kind === "binary") {
    walkExpression(node.left, visitor, depth + 1);
    walkExpression(node.right, visitor, depth + 1);
  } else if (node.kind === "conditional") {
    walkExpression(node.condition, visitor, depth + 1);
    walkExpression(node.whenTrue, visitor, depth + 1);
    walkExpression(node.whenFalse, visitor, depth + 1);
  } else if (node.kind === "call")
    for (const argument of node.arguments) walkExpression(argument, visitor, depth + 1);
}

export function extractExpressionDependencies(ast: ExpressionNode): readonly BindingDependency[] {
  const seen = new Set<string>();
  const dependencies: BindingDependency[] = [];
  walkExpression(ast, (node) => {
    if (node.kind === "runtime-reference" && !seen.has(node.key)) {
      seen.add(node.key);
      dependencies.push(Object.freeze({ kind: "runtime-value", key: node.key }));
    }
  });
  return Object.freeze(dependencies);
}

export interface ExpressionCompileOptions {
  readonly language?: string;
  readonly limits?: Readonly<ExpressionLanguageLimits>;
  readonly functions?: ExpressionFunctionRegistry;
}

export function compileExpression(
  source: string,
  options: Readonly<ExpressionCompileOptions> = {}
): ExpressionCompileResult {
  const language = options.language ?? EXPRESSION_LANGUAGE_VERSION;
  if (language !== EXPRESSION_LANGUAGE_VERSION)
    return {
      success: false,
      diagnostics: [
        expressionDiagnostic(
          "EXPRESSION_UNSUPPORTED_LANGUAGE",
          "Expression language version is unsupported.",
          { start: 0, end: source.length },
          { language }
        )
      ]
    };
  const limits = options.limits ?? DEFAULT_EXPRESSION_LIMITS;
  const functions = options.functions ?? createDefaultExpressionFunctionRegistry();
  const tokenized = tokenizeExpression(source, limits);
  if (!tokenized.success) return tokenized;
  const parsed = parseExpression(tokenized.tokens, limits);
  if (!parsed.success) return parsed;
  const diagnostics: BindingDiagnostic[] = [];
  let maximumDepth = 0;
  walkExpression(parsed.ast, (node, depth) => {
    maximumDepth = Math.max(maximumDepth, depth);
    if (node.kind === "identifier")
      diagnostics.push(
        expressionDiagnostic(
          "EXPRESSION_UNKNOWN_IDENTIFIER",
          "Plain identifiers are not available in expression scope.",
          node.range,
          { identifier: node.name }
        )
      );
    if (node.kind === "call") {
      const definition = functions.get(node.name);
      if (definition === undefined)
        diagnostics.push(
          expressionDiagnostic(
            "EXPRESSION_UNKNOWN_FUNCTION",
            "Expression calls an unknown function.",
            node.range,
            { functionName: node.name }
          )
        );
      else if (
        node.arguments.length < definition.minimumArguments ||
        node.arguments.length > definition.maximumArguments
      )
        diagnostics.push(
          expressionDiagnostic(
            "EXPRESSION_INVALID_FUNCTION_ARITY",
            "Expression function has an invalid argument count.",
            node.range,
            {
              functionName: node.name,
              actual: node.arguments.length,
              minimum: definition.minimumArguments,
              maximum: definition.maximumArguments
            }
          )
        );
    }
    if (
      node.kind === "binary" &&
      ["<", "<=", ">", ">="].includes(node.operator) &&
      node.left.kind === "binary" &&
      ["<", "<=", ">", ">="].includes(node.left.operator)
    )
      diagnostics.push(
        expressionDiagnostic(
          "EXPRESSION_UNEXPECTED_TOKEN",
          "Chained comparisons are not supported.",
          node.range
        )
      );
  });
  const dependencies = extractExpressionDependencies(parsed.ast);
  if (dependencies.length > limits.maximumRuntimeReferences)
    diagnostics.push(
      expressionDiagnostic(
        "EXPRESSION_DEPENDENCY_LIMIT_EXCEEDED",
        "Expression runtime dependencies exceed the configured limit.",
        parsed.ast.range,
        { maximumRuntimeReferences: limits.maximumRuntimeReferences }
      )
    );
  if (diagnostics.length > 0) return { success: false, diagnostics: Object.freeze(diagnostics) };
  return {
    success: true,
    compiled: Object.freeze({
      language: EXPRESSION_LANGUAGE_VERSION,
      source,
      ast: parsed.ast,
      dependencies,
      diagnostics: Object.freeze([]),
      complexity: Object.freeze({
        sourceLength: source.length,
        tokenCount: tokenized.tokens.length,
        astNodes: parsed.astNodes,
        maximumDepth,
        runtimeReferences: dependencies.length
      })
    })
  };
}

class EvaluationFailure extends Error {
  public constructor(
    public readonly code: BindingDiagnosticCode,
    message: string,
    public readonly range: ExpressionSourceRange,
    public readonly context: Readonly<Record<string, JsonValue>> = {}
  ) {
    super(message);
  }
}

export interface ExpressionEvaluationContext {
  readonly runtime: RuntimeBindingValueReader | RuntimeSnapshot;
  readonly functions?: ExpressionFunctionRegistry;
  readonly limits?: Readonly<ExpressionLanguageLimits>;
  readonly rejectedQuality?: "reject" | "accept";
  /** Internal composition hook: transform the raw result before target validation. */
  readonly deferTargetValidation?: boolean;
}

export type ExpressionValueResult =
  | {
      readonly success: true;
      readonly value: JsonValue;
      readonly steps: number;
      readonly qualities: readonly DataQuality[];
      readonly timestamps: readonly number[];
    }
  | { readonly success: false; readonly diagnostic: BindingDiagnostic };

function expressionArgumentAt(
  arguments_: readonly ExpressionNode[],
  index: number,
  range: ExpressionSourceRange
): ExpressionNode {
  const argument = arguments_[index];
  if (argument === undefined)
    throw new EvaluationFailure(
      "EXPRESSION_INVALID_FUNCTION_ARITY",
      "Expression function argument is missing.",
      range
    );
  return argument;
}

export function evaluateExpression(
  compiled: Readonly<CompiledExpression>,
  context: Readonly<ExpressionEvaluationContext>
): ExpressionValueResult {
  const functions = context.functions ?? createDefaultExpressionFunctionRegistry();
  const maximumSteps =
    context.limits?.maximumEvaluationSteps ?? DEFAULT_EXPRESSION_LIMITS.maximumEvaluationSteps;
  let steps = 0;
  const qualities: DataQuality[] = [];
  const timestamps: number[] = [];
  const evaluate = (node: ExpressionNode): JsonValue => {
    steps += 1;
    if (steps > maximumSteps)
      throw new EvaluationFailure(
        "EXPRESSION_EVALUATION_LIMIT_EXCEEDED",
        "Expression evaluation exceeded the configured step limit.",
        node.range,
        { maximumEvaluationSteps: maximumSteps }
      );
    if (node.kind === "literal") return node.value;
    if (node.kind === "identifier")
      throw new EvaluationFailure(
        "EXPRESSION_UNKNOWN_IDENTIFIER",
        "Plain identifiers are not available.",
        node.range
      );
    if (node.kind === "runtime-reference") {
      const point = context.runtime.get(node.key);
      if (point === undefined)
        throw new EvaluationFailure(
          "EXPRESSION_RUNTIME_VALUE_MISSING",
          "Expression runtime value is not available.",
          node.range,
          { runtimeKey: node.key }
        );
      if (!["good", "uncertain"].includes(point.quality) && context.rejectedQuality !== "accept")
        throw new EvaluationFailure(
          "EXPRESSION_RUNTIME_VALUE_BAD_QUALITY",
          "Expression runtime quality is rejected.",
          node.range,
          { runtimeKey: node.key, quality: point.quality }
        );
      if (!isJsonValue(point.value))
        throw new EvaluationFailure(
          "EXPRESSION_TYPE_MISMATCH",
          "Expression runtime value is not JSON-safe.",
          node.range,
          { runtimeKey: node.key }
        );
      qualities.push(point.quality);
      timestamps.push(point.timestamp);
      return cloneExpressionJson(point.value);
    }
    if (node.kind === "unary") {
      const value = evaluate(node.operand);
      if (node.operator === "!") {
        if (typeof value !== "boolean")
          throw new EvaluationFailure(
            "EXPRESSION_TYPE_MISMATCH",
            "Logical negation requires a boolean.",
            node.range
          );
        return !value;
      }
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new EvaluationFailure(
          "EXPRESSION_TYPE_MISMATCH",
          "Numeric unary operators require a finite number.",
          node.range
        );
      return node.operator === "-" ? -value : value;
    }
    if (node.kind === "conditional") {
      const condition = evaluate(node.condition);
      if (typeof condition !== "boolean")
        throw new EvaluationFailure(
          "EXPRESSION_TYPE_MISMATCH",
          "Conditional expression requires a boolean condition.",
          node.condition.range
        );
      return evaluate(condition ? node.whenTrue : node.whenFalse);
    }
    if (node.kind === "call") {
      const definition = functions.get(node.name);
      if (definition === undefined)
        throw new EvaluationFailure(
          "EXPRESSION_UNKNOWN_FUNCTION",
          "Expression function is unavailable.",
          node.range,
          { functionName: node.name }
        );
      if (node.name === "if") {
        const condition = evaluate(expressionArgumentAt(node.arguments, 0, node.range));
        if (typeof condition !== "boolean")
          throw new EvaluationFailure(
            "EXPRESSION_TYPE_MISMATCH",
            "if requires a boolean condition.",
            node.range
          );
        return evaluate(expressionArgumentAt(node.arguments, condition ? 1 : 2, node.range));
      }
      const arguments_ = node.arguments.map(evaluate);
      try {
        const value = definition.evaluate(Object.freeze(arguments_));
        if (!isJsonValue(value))
          throw new TypeError("Expression function returned a non-JSON value.");
        return value;
      } catch {
        throw new EvaluationFailure(
          "EXPRESSION_FUNCTION_ERROR",
          "Expression function evaluation failed.",
          node.range,
          { functionName: node.name }
        );
      }
    }
    if (node.operator === "&&" || node.operator === "||") {
      const left = evaluate(node.left);
      if (typeof left !== "boolean")
        throw new EvaluationFailure(
          "EXPRESSION_TYPE_MISMATCH",
          "Logical operators require booleans.",
          node.left.range
        );
      if (node.operator === "&&" && !left) return false;
      if (node.operator === "||" && left) return true;
      const right = evaluate(node.right);
      if (typeof right !== "boolean")
        throw new EvaluationFailure(
          "EXPRESSION_TYPE_MISMATCH",
          "Logical operators require booleans.",
          node.right.range
        );
      return right;
    }
    const left = evaluate(node.left);
    const right = evaluate(node.right);
    if (node.operator === "==" || node.operator === "!=") {
      const equal =
        typeof left === typeof right &&
        (left === null || typeof left !== "object") &&
        Object.is(left, right);
      return node.operator === "==" ? equal : !equal;
    }
    if (["<", "<=", ">", ">="].includes(node.operator)) {
      if (!(
        (typeof left === "number" &&
          Number.isFinite(left) &&
          typeof right === "number" &&
          Number.isFinite(right)) ||
        (typeof left === "string" && typeof right === "string")
      ))
        throw new EvaluationFailure(
          "EXPRESSION_TYPE_MISMATCH",
          "Comparison requires two finite numbers or two strings.",
          node.range
        );
      if (node.operator === "<") return left < right;
      if (node.operator === "<=") return left <= right;
      if (node.operator === ">") return left > right;
      return left >= right;
    }
    if (
      typeof left !== "number" ||
      !Number.isFinite(left) ||
      typeof right !== "number" ||
      !Number.isFinite(right)
    )
      throw new EvaluationFailure(
        "EXPRESSION_TYPE_MISMATCH",
        "Arithmetic requires finite numbers.",
        node.range
      );
    if (node.operator === "/" && right === 0)
      throw new EvaluationFailure(
        "EXPRESSION_DIVISION_BY_ZERO",
        "Division by zero is not allowed.",
        node.range
      );
    if (node.operator === "%" && right === 0)
      throw new EvaluationFailure(
        "EXPRESSION_REMAINDER_BY_ZERO",
        "Remainder by zero is not allowed.",
        node.range
      );
    const value =
      node.operator === "+"
        ? left + right
        : node.operator === "-"
          ? left - right
          : node.operator === "*"
            ? left * right
            : node.operator === "/"
              ? left / right
              : left % right;
    if (!Number.isFinite(value))
      throw new EvaluationFailure(
        "EXPRESSION_NON_FINITE_RESULT",
        "Expression produced a non-finite number.",
        node.range
      );
    return value;
  };
  try {
    return {
      success: true,
      value: evaluate(compiled.ast),
      steps,
      qualities: Object.freeze(qualities),
      timestamps: Object.freeze(timestamps)
    };
  } catch (error) {
    const failure =
      error instanceof EvaluationFailure
        ? error
        : new EvaluationFailure(
            "EXPRESSION_EVALUATION_ERROR",
            "Expression evaluation failed unexpectedly.",
            compiled.ast.range
          );
    return {
      success: false,
      diagnostic: expressionDiagnostic(
        failure.code,
        failure.message,
        failure.range,
        failure.context
      )
    };
  }
}

export type ExpressionBindingDefinition = PropertyBinding & {
  readonly source: Extract<PropertyBinding["source"], { readonly type: "expression" }>;
};

export type ExpressionBindingEvaluationContext = ExpressionEvaluationContext;

export interface ExpressionBindingEvaluationResult extends BindingEvaluationResult {
  readonly bindingType: "expression";
  readonly language: ExpressionLanguageVersion;
}

function bindingDiagnostic(
  definition: Readonly<ExpressionBindingDefinition>,
  diagnostic: BindingDiagnostic
): BindingDiagnostic {
  return Object.freeze({
    ...diagnostic,
    bindingId: definition.id,
    owner: Object.freeze(getBindingOwner(definition))
  });
}

function expressionBindingResult(
  definition: Readonly<ExpressionBindingDefinition>,
  status: ExpressionBindingEvaluationResult["status"],
  dependencies: readonly BindingDependency[],
  diagnostics: readonly BindingDiagnostic[],
  revision: number | undefined,
  value?: JsonValue
): ExpressionBindingEvaluationResult {
  return Object.freeze({
    bindingId: definition.id,
    bindingType: "expression",
    language: EXPRESSION_LANGUAGE_VERSION,
    status,
    target: Object.freeze({ ...definition.target }),
    dependencies,
    diagnostics: Object.freeze(diagnostics.map((entry) => bindingDiagnostic(definition, entry))),
    ...(revision === undefined ? {} : { revision }),
    ...(value === undefined ? {} : { value: cloneExpressionJson(value) })
  });
}

function expressionFallback(
  definition: Readonly<ExpressionBindingDefinition>,
  dependencies: readonly BindingDependency[],
  reason: BindingDiagnostic,
  revision: number | undefined
): ExpressionBindingEvaluationResult {
  if (definition.fallback === undefined)
    return expressionBindingResult(
      definition,
      reason.code === "EXPRESSION_TARGET_TYPE_MISMATCH" ? "invalid" : "unresolved",
      dependencies,
      [reason],
      revision
    );
  if (!isBindingTargetValueCompatible(definition.target, definition.fallback))
    return expressionBindingResult(
      definition,
      "invalid",
      dependencies,
      [
        reason,
        expressionDiagnostic(
          "BINDING_INVALID_FALLBACK",
          "The expression fallback is not compatible with its target.",
          { start: 0, end: definition.source.expression.length }
        )
      ],
      revision
    );
  return expressionBindingResult(
    definition,
    "fallback",
    dependencies,
    [
      reason,
      expressionDiagnostic(
        "EXPRESSION_FALLBACK_USED",
        "The explicit expression fallback was used.",
        { start: 0, end: definition.source.expression.length }
      )
    ],
    revision,
    definition.fallback
  );
}

function evaluateExpressionBindingInternal(
  definition: Readonly<ExpressionBindingDefinition>,
  context: Readonly<ExpressionBindingEvaluationContext>
): ExpressionBindingEvaluationResult {
  const revision = context.runtime.revision;
  if (!definition.enabled)
    return expressionBindingResult(definition, "disabled", Object.freeze([]), [], revision);
  const compiled = compileExpression(definition.source.expression, {
    ...(definition.source.language === undefined ? {} : { language: definition.source.language }),
    ...(context.limits === undefined ? {} : { limits: context.limits }),
    ...(context.functions === undefined ? {} : { functions: context.functions })
  });
  if (!compiled.success)
    return expressionBindingResult(
      definition,
      "invalid",
      Object.freeze([]),
      compiled.diagnostics,
      revision
    );
  const evaluated = evaluateExpression(compiled.compiled, context);
  if (!evaluated.success) {
    if (evaluated.diagnostic.code === "EXPRESSION_EVALUATION_LIMIT_EXCEEDED")
      return expressionBindingResult(
        definition,
        "invalid",
        compiled.compiled.dependencies,
        [evaluated.diagnostic],
        revision
      );
    if (evaluated.diagnostic.code === "EXPRESSION_EVALUATION_ERROR")
      return expressionBindingResult(
        definition,
        "error",
        compiled.compiled.dependencies,
        [evaluated.diagnostic],
        revision
      );
    return expressionFallback(
      definition,
      compiled.compiled.dependencies,
      evaluated.diagnostic,
      revision
    );
  }
  if (
    context.deferTargetValidation !== true &&
    !isBindingTargetValueCompatible(definition.target, evaluated.value)
  )
    return expressionFallback(
      definition,
      compiled.compiled.dependencies,
      expressionDiagnostic(
        "EXPRESSION_TARGET_TYPE_MISMATCH",
        "Expression result is not compatible with the binding target.",
        compiled.compiled.ast.range,
        { valueType: evaluated.value === null ? "null" : typeof evaluated.value }
      ),
      revision
    );
  return expressionBindingResult(
    definition,
    "resolved",
    compiled.compiled.dependencies,
    [],
    revision,
    evaluated.value
  );
}

export function evaluateExpressionBinding(
  definition: Readonly<ExpressionBindingDefinition>,
  context: Readonly<ExpressionBindingEvaluationContext>
): ExpressionBindingEvaluationResult {
  try {
    return evaluateExpressionBindingInternal(definition, context);
  } catch {
    return expressionBindingResult(
      definition,
      "error",
      Object.freeze([]),
      [
        expressionDiagnostic(
          "EXPRESSION_EVALUATION_ERROR",
          "Expression binding evaluation failed unexpectedly.",
          { start: 0, end: definition.source.expression.length }
        )
      ],
      context.runtime.revision
    );
  }
}

export function evaluateExpressionBindings(
  definitions: readonly Readonly<ExpressionBindingDefinition>[],
  context: Readonly<ExpressionBindingEvaluationContext>
): readonly ExpressionBindingEvaluationResult[] {
  return Object.freeze(
    definitions.map((definition) => evaluateExpressionBinding(definition, context))
  );
}

export function registerExpressionBindingType(registry: BindingTypeRegistry): void {
  registry.register({
    type: "expression",
    getDependencies(definition) {
      if (definition.source.type !== "expression") return Object.freeze([]);
      const compiled = compileExpression(definition.source.expression, {
        ...(definition.source.language === undefined
          ? {}
          : { language: definition.source.language })
      });
      return compiled.success ? compiled.compiled.dependencies : Object.freeze([]);
    }
  });
}
