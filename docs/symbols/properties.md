# Symbol properties

Properties are described by `PropertyMetadata`; the Designer and binding authoring layer consume
this metadata. Existing documents use flat property maps, so this refactor intentionally performs
no nested namespace migration. Default values are validated against numeric bounds and duplicate
keys are rejected. Runtime-resolved values never overwrite the document property map.
