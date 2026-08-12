import type { deploymentStates, publicationRunStates } from "./contracts";

export type PublicationRunState = (typeof publicationRunStates)[number];
export type DeploymentState = (typeof deploymentStates)[number];

const publicationRunTransitions: Readonly<Record<PublicationRunState, readonly PublicationRunState[]>> = {
  queued: ["ingesting", "failed"],
  ingesting: ["normalizing", "failed"],
  normalizing: ["reconciling", "failed"],
  reconciling: ["selecting", "failed"],
  selecting: ["generating", "failed"],
  generating: ["rendering", "failed"],
  rendering: ["validating", "failed"],
  validating: ["deploying-preview", "failed"],
  "deploying-preview": ["validating-preview", "failed"],
  "validating-preview": ["promoting", "failed"],
  promoting: ["verifying-production", "failed"],
  "verifying-production": ["finalizing", "failed"],
  finalizing: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
};

const deploymentTransitions: Readonly<Record<DeploymentState, readonly DeploymentState[]>> = {
  preview: ["validating", "quarantined"],
  validating: ["promoted", "quarantined"],
  promoted: ["valid", "quarantined", "restore-failed"],
  valid: ["quarantined", "restore-failed"],
  quarantined: [],
  "restore-failed": [],
};

function transition<State extends string>(
  kind: string,
  allowed: Readonly<Record<State, readonly State[]>>,
  current: State,
  next: State,
): State {
  if (!allowed[current].includes(next)) {
    throw new Error(`Illegal ${kind} transition from ${current} to ${next}`);
  }
  return next;
}

export function transitionPublicationRun(current: PublicationRunState, next: PublicationRunState) {
  return transition("Publication run", publicationRunTransitions, current, next);
}

export function transitionDeployment(current: DeploymentState, next: DeploymentState) {
  return transition("deployment", deploymentTransitions, current, next);
}
