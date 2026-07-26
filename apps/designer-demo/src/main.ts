import {
  DeterministicIdGenerator,
  FixedClock,
  createScadaDocument,
  serializeDocumentJson,
  validateDocumentSemantics
} from "@web-scada/core";
import { snapValueToGrid } from "@web-scada/geometry";

import "./style.css";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Application mount point not found");
const scadaDocument = createScadaDocument({
  name: "Designer Core Preview",
  idGenerator: new DeterministicIdGenerator(),
  clock: new FixedClock("2026-01-01T00:00:00.000Z")
});
const validation = validateDocumentSemantics(scadaDocument);
const serialized = serializeDocumentJson(scadaDocument, true);

app.innerHTML = `
  <section class="status-card">
    <p class="eyebrow">PHASE 1 · CORE ENGINE</p>
    <h1>Web SCADA Core</h1>
    <p>The immutable domain engine is initialized. Visual editing remains deferred.</p>
    <dl>
      <div><dt>Schema</dt><dd>${scadaDocument.schemaVersion}</dd></div>
      <div><dt>Nodes</dt><dd>${String(scadaDocument.nodes.length)}</dd></div>
      <div><dt>Validation</dt><dd>${validation.valid ? "valid" : "invalid"}</dd></div>
      <div><dt>Grid contract</dt><dd>${String(snapValueToGrid(23, 10))} logical units</dd></div>
      <div><dt>Serialized</dt><dd>${serialized.success ? "ready" : "failed"}</dd></div>
    </dl>
  </section>
`;
