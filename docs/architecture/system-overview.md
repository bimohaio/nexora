# System overview

Web SCADA separates portable domain state from browser adapters. `core` owns versioned design data. `geometry` owns logical-coordinate math. `symbols` describes components as metadata. Engines orchestrate future design/runtime behavior, the SVG package renders readonly inputs, and Web Components adapt engines to browser UI.

Applications consume package public exports only. Node.js can use core, geometry, symbols, and engine contracts without DOM globals.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
