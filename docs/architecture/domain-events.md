# Domain events

Core events are plain TypeScript objects, never browser `CustomEvent`. Each carries an event ID, discriminating type, ISO timestamp, document ID, JSON-safe payload, and metadata. Mutations return events directly; Phase 1 intentionally has no global event bus.
