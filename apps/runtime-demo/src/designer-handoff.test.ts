import { describe, expect, it } from "vitest";
import {
  DESIGNER_DOCUMENT_FRAGMENT_KEY,
  createDesignerHandoffUrl,
  resolveDesignerUrl
} from "./designer-handoff.js";

describe("runtime to designer handoff", () => {
  it("puts the persisted document in a fragment without changing its JSON", () => {
    const documentJson = '{"name":"Bơm cấp nước","state":"design-only"}';
    const result = new URL(
      createDesignerHandoffUrl("https://scada.test/designer/", documentJson, {
        sessionId: "edit-1",
        runtimeOrigin: "https://runtime.scada.test",
        baseRevision: 3
      })
    );
    const fragment = new URLSearchParams(result.hash.slice(1));

    expect(result.origin + result.pathname).toBe("https://scada.test/designer/");
    expect(fragment.get(DESIGNER_DOCUMENT_FRAGMENT_KEY)).toBe(documentJson);
    expect(fragment.get("source")).toBe("runtime");
    expect(fragment.get("session")).toBe("edit-1");
    expect(fragment.get("runtimeOrigin")).toBe("https://runtime.scada.test");
    expect(fragment.get("baseRevision")).toBe("3");
    expect(result.search).toBe("");
  });

  it("resolves the separate local Designer server and production route", () => {
    expect(resolveDesignerUrl(new URL("http://127.0.0.1:4173/")).toString()).toBe(
      "http://127.0.0.1:4175/"
    );
    expect(resolveDesignerUrl(new URL("http://localhost:5173/")).toString()).toBe(
      "http://localhost:4175/"
    );
    expect(resolveDesignerUrl(new URL("https://scada.test/runtime/")).toString()).toBe(
      "https://scada.test/designer/"
    );
    expect(
      resolveDesignerUrl(
        new URL("https://scada.test/runtime/"),
        "https://designer.scada.test/project"
      ).toString()
    ).toBe("https://designer.scada.test/project");
  });
});
