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

/** Applies calculated SVG state while retaining compatible element identities. */
export function synchronizeSvgElement(target: Element, source: Element): void {
  for (const attribute of Array.from(target.attributes))
    if (!source.hasAttribute(attribute.name) && !attribute.name.startsWith("data-scada-"))
      target.removeAttribute(attribute.name);
  for (const attribute of Array.from(source.attributes))
    target.setAttribute(attribute.name, attribute.value);
  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    const sourceChild = sourceChildren[index];
    const targetChild = targetChildren[index];
    if (sourceChild === undefined) continue;
    if (targetChild?.tagName.toLowerCase() !== sourceChild.tagName.toLowerCase()) {
      const replacement = sourceChild.cloneNode(true);
      if (targetChild === undefined) target.append(replacement);
      else targetChild.replaceWith(replacement);
    } else synchronizeSvgElement(targetChild, sourceChild);
  }
  for (let index = target.children.length - 1; index >= sourceChildren.length; index -= 1)
    target.children[index]?.remove();
  if (sourceChildren.length === 0) target.textContent = source.textContent;
}
import type { EntityPointerMetadata } from "./contracts.js";
