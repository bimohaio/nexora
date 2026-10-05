# Web SCADA Engine Agent Rules

## Source of Truth

The following documents are authoritative:

1. Web SCADA Engine Master Specification
2. The active phase prompt
3. Existing repository architecture and public contracts
4. Existing tests and package boundaries

When requirements conflict, do not guess. Record the conflict and choose the
least destructive compatible implementation.

## Mandatory Workflow

For every phase:

1. Read the complete phase prompt.
2. Inspect the affected repository packages.
3. Create a requirement traceability checklist.
4. Create an implementation plan.
5. Implement in small batches.
6. Run tests after each meaningful batch.
7. Perform a final requirement-by-requirement audit.
8. Do not report completion without command evidence.

## Architecture Rules

- Do not mutate persisted ScadaDocument from runtime behavior.
- Do not introduce renderer-specific types into generic contracts.
- Do not bypass Runtime Engine or Binding Engine.
- Do not add per-symbol timers or animation loops.
- Do not add central switch statements for symbol types.
- Do not weaken existing tests.
- Do not replace compatible APIs without justification.
- Do not introduce placeholders, fake implementations, or TODO-only files.
- Do not implement functionality belonging to a later phase.

## Compatibility Rules

- Preserve existing public APIs whenever possible.
- Preserve serialized document compatibility.
- Preserve symbol type IDs, property names, and port IDs.
- Add migrations and migration tests for persisted schema changes.
- Run the existing regression suite before declaring success.

## Completion Rules

A requirement is complete only when it has:

- implementation evidence;
- test evidence;
- documentation evidence where required;
- no unresolved critical regression.

Never claim a command passed unless it was actually executed.

Never claim READY if required tests were skipped without documenting the reason.
