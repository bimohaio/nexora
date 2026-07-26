# Package boundaries

Current packages are `@web-scada/core`, `geometry`, `symbols`, `renderer-svg`,
`designer-engine`, `runtime-engine`, `web-components`, and `shared`. SCADA Core,
geometry, symbols, Designer Engine contracts, and Runtime Engine contracts must
remain independent of application UI. SVG DOM types belong only to the Renderer.

Future Binding Engine and Plugin SDK packages must depend on stable public
contracts, never renderer internals or application code. Demo applications may
compose packages but do not define framework APIs.

See also:

- [Dependency rules](dependency-rules.md)
- [Module dependencies](../architecture/module-dependencies.md)
- [Public API policy](public-api-policy.md)
