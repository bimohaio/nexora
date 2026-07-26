# Extensions

`ExtensionData` is an opaque JSON-safe record supported at controlled extension points. Keys should be namespace-qualified, such as `vendor.example.assetClass`. Core preserves extension values but does not interpret them. Arbitrary unknown fields on stable core structures are not an extension mechanism.

See also:

- [Data-model index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Conventions](../conventions/README.md)
