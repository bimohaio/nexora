# JSON-safe values

Persist only strings, finite numbers, booleans, null, arrays of JSON-safe values, and plain objects containing JSON-safe values. Functions, symbols, bigint, class instances, cyclic objects, `NaN`, and infinity are invalid. External values stay `unknown` until parsed.
