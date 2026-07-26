export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  name: K
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, name);
}

export function setOptionalAttribute(
  element: Element,
  name: string,
  value: string | number | undefined
): void {
  if (value === undefined) element.removeAttribute(name);
  else element.setAttribute(name, String(value));
}

export function setDataAttributes(
  element: SVGElement,
  values: Readonly<Record<string, string | undefined>>
): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined)
      element.removeAttribute(
        `data-${name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
      );
    else element.dataset[name] = value;
  }
}

export function portKey(nodeId: string, portId: string): string {
  return `${nodeId}::${portId}`;
}

export function resolveEntityMetadata(target: EventTarget | null): EntityPointerMetadata {
  let current = target instanceof Element ? target : null;
  while (current !== null) {
    const entityType = current.getAttribute("data-entity-type");
    if (entityType !== null) {
      const read = (name: string): string | undefined => current?.getAttribute(name) ?? undefined;
      const entityId = read("data-entity-id");
      const nodeId = read("data-node-id");
      const portId = read("data-port-id");
      const connectionId = read("data-connection-id");
      const layerId = read("data-layer-id");
      return {
        entityType,
        ...(entityId === undefined ? {} : { entityId }),
        ...(nodeId === undefined ? {} : { nodeId }),
        ...(portId === undefined ? {} : { portId }),
        ...(connectionId === undefined ? {} : { connectionId }),
        ...(layerId === undefined ? {} : { layerId })
      };
    }
    current = current.parentElement;
  }
  return {};
}
import type { EntityPointerMetadata } from "./contracts.js";
