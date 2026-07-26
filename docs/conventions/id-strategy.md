# ID strategy

Generated IDs should use UUID v7 or ULID with readable prefixes: `doc_`, `node_`, `conn_`, `layer_`, `group_`, `bind_`, and `tag_`. Never use incremental frontend IDs. Static symbol ports use stable semantic IDs such as `inlet`, `outlet`, `signal`, and `power`.
