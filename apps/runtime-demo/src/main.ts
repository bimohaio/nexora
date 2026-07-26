import { SCADA_SCHEMA_VERSION } from "@web-scada/core";
import type { DataQuality, RuntimeValue } from "@web-scada/runtime-engine";

import "./style.css";

const quality: DataQuality = "unknown";
const example: RuntimeValue = {
  tagId: "tag_example",
  value: null,
  dataType: "json",
  quality,
  timestamp: new Date(0).toISOString()
};
const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Application mount point not found");

app.innerHTML = `
  <section>
    <span>RUNTIME ARCHITECTURE</span>
    <h1>Web SCADA Viewer</h1>
    <p>Schema ${SCADA_SCHEMA_VERSION} · Data provider disconnected by design</p>
    <output>Example quality: ${example.quality}</output>
  </section>
`;
