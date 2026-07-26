import { SCADA_SCHEMA_VERSION } from "@web-scada/core";
import { snapValueToGrid } from "@web-scada/geometry";

import "./style.css";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Application mount point not found");

app.innerHTML = `
  <section class="status-card">
    <p class="eyebrow">PHASE 0 · FOUNDATION</p>
    <h1>Web SCADA Designer</h1>
    <p>Framework-independent engine architecture is ready for Phase 1.</p>
    <dl>
      <div><dt>Schema</dt><dd>${SCADA_SCHEMA_VERSION}</dd></div>
      <div><dt>Grid contract</dt><dd>${String(snapValueToGrid(23, 10))} logical units</dd></div>
      <div><dt>Designer tools</dt><dd>Intentionally deferred</dd></div>
    </dl>
  </section>
`;
