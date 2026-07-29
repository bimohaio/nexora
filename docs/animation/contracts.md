# Animation Contracts

Built-in identifiers cover blink, flash, rotate, translate, scale, opacity, flow
and transition. A definition contains a stable engine entity target, safe trigger,
timing, policies and JSON-safe parameters. CSS selectors, DOM IDs, callbacks and
protocol configuration are invalid.

Extension identifiers must be registered in an instance of
`AnimationTypeRegistry`. Registration declares supported properties and may
validate parameters. Unknown unregistered types are isolated by validation.
