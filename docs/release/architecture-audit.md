# Interaction Engine architecture audit

Audit date: 2026-07-27. Scope: Interaction Engine, Designer adapters, Geometry,
Renderer SVG adapters, Web Components, scheduling, and test infrastructure.

## Result

| Finding                  | Status | Evidence                                                                                                                               |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Package ownership        | PASS   | Interaction owns input/state logic; Designer adapters own document commands; Renderer SVG owns DOM projection.                         |
| Dependency direction     | PASS   | Interaction depends only on Geometry. Designer and Renderer SVG depend inward on Interaction; Interaction has no reverse dependency.   |
| Renderer independence    | PASS   | No renderer import exists in `packages/interaction-engine`; renderer behavior crosses typed adapter contracts.                         |
| Framework independence   | PASS   | No React, Vue, Angular, Svelte, or framework runtime is declared or imported.                                                          |
| Browser independence     | PASS   | Browser timing is injected by `SchedulerTimingAdapter`; the default adapter is the only timer boundary.                                |
| Immutable state          | PASS   | State factories freeze published state; selection, focus, keyboard, accessibility, and session updates replace snapshots.              |
| Deterministic event flow | PASS   | Tests prove session-first routing, capture/target/bubble order, priority, cancellation, queue flushing, and stable selection ordering. |
| Resource ownership       | PASS   | Adapters, sessions, queues, focus, keyboard, accessibility, scheduler, and renderer expose idempotent disposal paths.                  |

```text
Host input
  -> Interaction Engine
       -> coordinates -> hit testing -> selection
       -> pointer -> drag session -> command contract
       -> keyboard -> focus
       -> accessibility state
       -> scheduler
  -> Designer adapters -> immutable document commands
  -> Renderer adapters -> SVG / ARIA / live region
```

No architectural blocker, cyclic ownership, duplicated renderer logic, or
framework leakage was found. The broad root export is intentional for the current
private `0.0.0` package, but must be frozen before a public semantic-versioned
release.
