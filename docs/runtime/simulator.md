# Runtime simulator

`createRuntimeSimulator()` creates a replaceable, protocol-neutral runtime producer. It writes
atomic batches to any `RuntimeUpdateSink`, including a runtime engine or store. Lifecycle methods
are `start`, `stop`, `pause`, `resume`, `reset`, `setSpeed`, `tick`, and `dispose`.

The default deterministic industrial scenario emits boolean, analog, randomised numeric, sine-like,
and quality-transition values. Custom scenarios can use `booleanValue`, `numberValue`,
`analogValue`, `randomValue`, `sineWave`, `squareWave`, `incrementalCounter`, and
`createGeneratorScenario`.

```ts
const simulator = createRuntimeSimulator({
  sink: engine,
  scenario: createGeneratorScenario({
    pressure: sineWave(2, 6, 100),
    running: squareWave(false, true, 20),
    batches: incrementalCounter()
  })
});
simulator.setSpeed(2);
simulator.start();
```

The seeded random source makes manual ticks repeatable. The simulator has no MQTT, OPC UA, Modbus,
renderer, or DOM dependency.
