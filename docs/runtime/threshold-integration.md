# Runtime threshold integration

Runtime takes a `RuntimeSnapshot`, invokes the binding engine, and writes only the
resolved output into visual state. Snapshot revision and changed keys determine
which bindings are reevaluated through `ThresholdDependencyTracker`. Renderer
packages consume that visual state and have no dependency on threshold,
conditional, or expression evaluators.

The evaluation context may include value, quality, timestamp, a deterministic
`now`, runtime snapshot, theme values, constants, and derived variables.
Timestamp comparisons should inject `now` from the runtime scheduler to make a
whole evaluation batch deterministic.
