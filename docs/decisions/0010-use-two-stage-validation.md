# ADR 0010: Use two-stage validation

## Status

Accepted

## Context

Unknown JSON shape and cross-entity correctness are different concerns.

## Decision

Run library-neutral structural validation before normalization and semantic validation.

## Consequences

Errors are precise and core has no schema-library dependency; schema checks require maintained code.

## Alternatives considered

A single validator blurred trust boundaries. A new validation library was not needed.
