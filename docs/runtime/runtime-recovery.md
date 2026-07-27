# Runtime recovery

`RuntimeRecoveryPolicyResolver` maps diagnostic codes to deterministic strategies: `ignore`,
`retry`, `fallback`, `disable-symbol`, or `escalate`. Applications can override the immutable
defaults by code.

Invalid values are ignored, invalid visual states and stale snapshots keep the previous safe
fallback, missing symbols may be disabled, listener failures are isolated, and simulator
interruptions may retry. Resolver, store, event, subscription, and scheduler delivery loops catch
component failures and continue with remaining work. Only an explicitly unrecoverable engine
failure should stop the runtime.

```ts
const policies = new RuntimeRecoveryPolicyResolver({
  PROVIDER_CONNECT_FAILED: { strategy: "retry", maximumAttempts: 3 }
});
```
