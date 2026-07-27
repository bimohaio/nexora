# Runtime subscriptions

## Architecture and ownership

```text
Provider / Simulator
        |
        v
Runtime Store -> Visual Snapshot Commit
                         |
                         v
             RuntimeSubscriptionManager
                |        |        |
             symbol   snapshot  status/value
             observer  observer   observer
```

The runtime engine owns one `RuntimeSubscriptionManager`. It is independent of providers,
protocols, UI frameworks, and SVG. Consumers own the returned `SubscriptionHandle` and should
dispose it when their scope ends. Engine disposal closes every remaining handle.

## Observer API

`RuntimeObserver` can implement any combination of:

- `onRuntimeValues`
- `onSnapshot`
- `onRevision`
- `onStatus`

Snapshot observations contain the previous and current immutable visual snapshots, revision,
timestamp, matched symbol IDs, and matched change types. Dispatch follows registration order.
Failures are isolated per observer.

```ts
const handle = engine.subscriptions.subscribe(
  {
    onSnapshot: ({ currentSnapshot, symbolIds }) => {
      updateRequiredSymbols(currentSnapshot, symbolIds);
    }
  },
  {
    symbolIds: ["pump-1", "valve-1"],
    properties: ["state", "visible"],
    changeTypes: ["updated"]
  }
);

handle.dispose();
```

Convenience APIs are `subscribeSymbol`, `subscribeSymbols`, and `subscribeSnapshot`. Registering
the same observer with an equivalent normalized filter returns the existing active handle.

## Filtering

Filters are applied before observer invocation:

- `symbolIds` matches node or connection IDs in a visual diff.
- `properties` matches resolved properties plus `state`, `visible`, and `quality`.
- `changeTypes` matches `added`, `updated`, or `removed`.

Symbol-filtered subscriptions do not receive unscoped raw tag-value observations.
