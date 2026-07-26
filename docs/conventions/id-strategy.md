# ID strategy

Production IDs use ULIDs with readable prefixes: `doc_`, `node_`, `conn_`, `layer_`, `group_`, `bind_`, `var_`, and `tag_`. The generator is injectable; deterministic counters exist for tests only. Never use incremental production document IDs. Static ports use semantic IDs such as `inlet` and `outlet`.
