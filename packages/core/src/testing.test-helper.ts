import {
  DeterministicIdGenerator,
  FixedClock,
  createScadaDocument,
  type ScadaDocument
} from "./index.js";

export const TEST_TIME = "2026-01-01T00:00:00.000Z";

export function createTestDocument(): ScadaDocument {
  return createScadaDocument({
    name: " Test Process ",
    tags: ["water", "water", " plant "],
    idGenerator: new DeterministicIdGenerator(),
    clock: new FixedClock(TEST_TIME)
  });
}
