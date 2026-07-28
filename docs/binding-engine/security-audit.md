# Binding Engine Security Audit

## Findings

- Expression execution uses a tokenizer, parser, readonly AST, and allowlisted operators/functions.
- Production Binding Engine sources contain no `eval`, `Function` constructor, DOM access, network
  access, or ambient global lookup.
- Source length, token, string, nesting, AST, dependency, and evaluation limits bound work.
- Unknown identifiers/functions and unsupported languages fail with recoverable diagnostics.
- Runtime JSON values are cloned; prototype-sensitive keys are rejected.
- Visual colors, ranges, transforms, targets, and connection styles are validated before output.
- Serialization uses JSON parsing plus structural and semantic validation.
- Binding failures remain data diagnostics and cannot inject HTML.

The SVG renderer owns DOM creation and uses namespaced element/attribute operations. The Binding
Engine never emits markup.

No critical or high-severity security issue was found. Application code must still treat tag names,
diagnostic messages, and imported document metadata as untrusted text when presenting them outside
the provided renderer.
