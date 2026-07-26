# @web-scada/core

Node- and browser-neutral SCADA domain engine. It includes immutable documents, construction, normalization, structural/semantic validation, parser/serializer, migrations, IDs/clocks, indexes/queries, required mutations, change sets, events, and command contracts.

```ts
const document = createScadaDocument({ name: "Plant" });
const parsed = parseDocumentJson(json, { symbolRegistry });
const changed = addNode(document, node);
const serialized = serializeDocumentJson(changed.success ? changed.document : document, true);
```

Unknown input always enters as `unknown`. Mutation failures return the original document. This package imports no DOM, SVG, renderer, transport, storage, or UI API.
