# Interaction dependency audit

## Declared graph

```text
Geometry
  -> Interaction Engine
       -> Designer Engine
       -> Renderer SVG
       -> Web Components

Core + Symbols -> Designer Engine / Renderer SVG / Runtime Engine
Designer Engine + Interaction Engine + Runtime Engine -> Web Components
```

| Package            | Direct internal dependencies         | Status |
| ------------------ | ------------------------------------ | ------ |
| Geometry           | none                                 | PASS   |
| Interaction Engine | Geometry                             | PASS   |
| Designer Engine    | Core, Geometry, Interaction, Symbols | PASS   |
| Renderer SVG       | Core, Geometry, Interaction, Symbols | PASS   |
| Runtime Engine     | Core, Symbols                        | PASS   |
| Web Components     | Designer, Interaction, Runtime       | PASS   |

No manifest cycle, hidden interaction-to-renderer dependency, framework dependency,
or browser package dependency was found. Renderer SVG uses Interaction only for
typed projection adapters; Interaction does not import Renderer SVG. Geometry math
is reused by coordinate and transform services rather than copied into renderer
contracts.
