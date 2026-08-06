/* eslint-disable @typescript-eslint/no-deprecated -- legacy registry compatibility coverage */
import { describe, expect, it } from "vitest";
import { DeterministicIdGenerator } from "@web-scada/core";
import { createExampleSymbolRegistry } from "@web-scada/symbols";
import { BindingAuthoringService } from "./binding-authoring.js";
import { NativeDesignerEngine } from "./engine.js";
import { createDesignerTestDocument } from "./testing.test-helper.js";

function setup(): {
  readonly designer: NativeDesignerEngine;
  readonly authoring: BindingAuthoringService;
} {
  const ids = new DeterministicIdGenerator();
  const symbols = createExampleSymbolRegistry();
  const base = createDesignerTestDocument(1);
  const document = {
    ...base,
    nodes: base.nodes.map((node) => ({ ...node, symbolType: "basic.rectangle" }))
  };
  const designer = new NativeDesignerEngine({ document, symbols, idGenerator: ids });
  return {
    designer,
    authoring: new BindingAuthoringService({ designer, symbols, idGenerator: ids })
  };
}

describe("binding authoring", () => {
  it("creates, updates, removes and restores bindings through history", () => {
    const { designer, authoring } = setup();
    const created = authoring.create({
      source: { type: "tag", tagId: "plant.level" },
      target: { type: "node-property", nodeId: "node_0", property: "fill" },
      mode: "one-way",
      enabled: true,
      fallback: "#64748b"
    });
    expect(created.success).toBe(true);
    expect(designer.getState().document.nodes[0]?.bindings).toEqual(["bind_0001"]);
    expect(authoring.update("bind_0001", { enabled: false }).success).toBe(true);
    designer.undo();
    expect(authoring.get("bind_0001")?.enabled).toBe(true);
    designer.redo();
    expect(authoring.get("bind_0001")?.enabled).toBe(false);
    expect(authoring.remove("bind_0001").success).toBe(true);
    designer.undo();
    expect(authoring.list()).toHaveLength(1);
  });

  it("rejects invalid edits without changing the document", () => {
    const { designer, authoring } = setup();
    const before = designer.getState().document;
    const result = authoring.create({
      source: { type: "tag", tagId: "" },
      target: { type: "node-property", nodeId: "missing", property: "fill" },
      mode: "one-way",
      enabled: true
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain("BINDING_OWNER_NOT_FOUND");
    expect(designer.getState().document).toBe(before);
  });

  it("provides property metadata and a non-evaluating preview", () => {
    const { authoring } = setup();
    const result = authoring.create({
      source: { type: "expression", expression: "tag('level') * 100" },
      target: { type: "node-property", nodeId: "node_0", property: "fill" },
      mode: "one-way",
      enabled: true,
      fallback: "gray"
    });
    expect(authoring.properties("node_0").find(({ key }) => key === "fill")?.binding?.id).toBe(
      result.binding?.id
    );
    expect(authoring.preview(result.binding?.id ?? "")?.sourceLabel).toBe(
      "Expression (evaluated at runtime)"
    );
    expect(authoring.preview(result.binding?.id ?? "")?.fallback).toBe("gray");
  });

  it("round-trips exports and resolves imported ID collisions", () => {
    const { authoring } = setup();
    authoring.create({
      id: "bind_external",
      source: { type: "constant", value: 42 },
      target: { type: "node-property", nodeId: "node_0", property: "fill" },
      mode: "one-way",
      enabled: true
    });
    expect(authoring.import(authoring.export(undefined, true)).success).toBe(true);
    expect(new Set(authoring.list().map(({ id }) => id)).size).toBe(2);
    expect(authoring.validateDocument().valid).toBe(true);
  });

  it("copies bindings with remapped IDs when a node is duplicated", async () => {
    const { designer, authoring } = setup();
    authoring.create({
      source: { type: "tag", tagId: "plant.level" },
      target: { type: "node-property", nodeId: "node_0", property: "fill" },
      mode: "one-way",
      enabled: true
    });
    designer.selectNode("node_0");
    await designer.duplicate();
    const bindings = designer.getState().document.bindings;
    const pastedNode = designer.getState().document.nodes.find(({ id }) => id !== "node_0");
    expect(bindings).toHaveLength(2);
    expect(new Set(bindings.map(({ id }) => id)).size).toBe(2);
    expect(bindings.find(({ id }) => pastedNode?.bindings.includes(id))?.target).toMatchObject({
      type: "node-property",
      nodeId: pastedNode?.id,
      property: "fill"
    });
  });
});
/* Legacy registry is intentional compatibility coverage. */
