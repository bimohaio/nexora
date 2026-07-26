# SVG DOM structure

```text
svg[data-scada-root]
├── defs[data-scada-defs]
│   ├── namespaced grid pattern
│   └── namespaced arrow markers
├── rect[data-scada-background]
├── g[data-scada-grid]
├── g[data-scada-viewport]
│   └── g[data-scada-scene]
│       └── g[data-scada-layers]
│           └── g[data-entity-type=layer]
│               ├── g[data-scada-connections]
│               │   ├── visible path
│               │   └── transparent hit-area path
│               ├── g[data-scada-nodes]
│               │   └── g[data-entity-type=node]
│               └── g[data-scada-ports]
├── g[data-scada-overlay]
└── g[data-scada-debug]
```

No user text enters through `innerHTML`; symbol labels use `textContent`. Definition IDs contain an instance ULID, allowing multiple renderers on one page.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
