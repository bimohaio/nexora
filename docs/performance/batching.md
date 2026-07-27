# Interaction Batching

`InteractionBatch` groups updates by kind and target key. Last-write-wins is the default;
kind-specific reducers can merge selection or accessibility payloads.

```text
pointer A(1) -> focus B -> pointer A(2)
                    |
                    v
          pointer A(2), focus B
```

Priority is evaluated at flush time and insertion sequence breaks ties. Entries can be canceled
before delivery. The existing event queue uses the same deterministic replacement model.
