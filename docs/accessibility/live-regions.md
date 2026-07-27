# Live Regions

Announcements support polite, assertive, and off politeness; kind, numeric priority, timestamps,
deduplication, queue limits, cancellation, and bounded batch delivery.

Higher priority is delivered first. Equal-priority assertive messages precede polite messages;
remaining ties use timestamp and ID for deterministic order. Identical queued messages with the
same politeness are deduplicated.
