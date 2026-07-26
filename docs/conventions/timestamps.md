# Timestamps

Serialized timestamps are ISO 8601 strings. Creation and mutation services receive a `Clock`; production uses `SystemClock`, while tests inject `FixedClock`. Document creation must not be after the last update.
