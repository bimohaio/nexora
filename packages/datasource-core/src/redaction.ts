const SENSITIVE_KEY =
  /password|passwd|token|secret|api[-_]?key|authorization|cookie|private[-_]?key|certificate[-_]?key|username/i;
const CREDENTIAL_TEXT = /(?:bearer\s+)[^\s,;]+|(?:[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@/\s]+@/gi;

export function redactDiagnosticValue(value: unknown): unknown {
  return redact(value, new WeakSet());
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string")
    return value.replace(CREDENTIAL_TEXT, (match) =>
      match.toLowerCase().startsWith("bearer") ? "Bearer [REDACTED]" : redactUri(match)
    );
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen));
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value))
    output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(entry, seen);
  return output;
}

function redactUri(value: string): string {
  return value.replace(/\/\/[^/@]+@/, "//[REDACTED]@");
}
