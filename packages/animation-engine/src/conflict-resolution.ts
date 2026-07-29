import type { AnimationContribution } from "./contracts.js";

function targetKey(contribution: AnimationContribution): string {
  const { target } = contribution;
  return `${target.kind}\u0000${target.entityId}\u0000${target.part ?? ""}\u0000${target.property}`;
}

export function resolveAnimationConflicts(
  contributions: readonly AnimationContribution[]
): readonly AnimationContribution[] {
  const winners = new Map<string, AnimationContribution>();
  for (const contribution of contributions) {
    const key = targetKey(contribution);
    const current = winners.get(key);
    if (
      current === undefined ||
      contribution.priority > current.priority ||
      (contribution.priority === current.priority &&
        (contribution.registrationOrder < current.registrationOrder ||
          (contribution.registrationOrder === current.registrationOrder &&
            contribution.instanceId.localeCompare(current.instanceId) < 0)))
    )
      winners.set(key, contribution);
  }
  return Object.freeze(
    [...winners.values()].sort(
      (left, right) =>
        targetKey(left).localeCompare(targetKey(right)) ||
        right.priority - left.priority ||
        left.registrationOrder - right.registrationOrder ||
        left.instanceId.localeCompare(right.instanceId)
    )
  );
}
