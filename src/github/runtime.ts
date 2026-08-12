import { GitHubDeliveryReceiver, type GitHubIngestionStore } from "./receiver";

type RuntimeOptions = {
  secret?: string;
  expectedRepository?: string;
  expectedWorkflowRef?: string;
  store: GitHubIngestionStore | null;
  now?: () => Date;
};

export type GitHubIngestionRuntime =
  | { status: "unavailable" }
  | { status: "ready"; receiver: GitHubDeliveryReceiver };

export function createGitHubIngestionRuntime(options: RuntimeOptions): GitHubIngestionRuntime {
  if (
    !options.store ||
    !options.secret ||
    options.secret.length < 32 ||
    !options.expectedRepository ||
    !options.expectedWorkflowRef
  ) {
    return { status: "unavailable" };
  }
  return {
    status: "ready",
    receiver: new GitHubDeliveryReceiver({
      store: options.store,
      secret: options.secret,
      expectedRepository: options.expectedRepository,
      expectedWorkflowRef: options.expectedWorkflowRef,
      replayWindowMs: 5 * 60_000,
      maxPayloadBytes: 1_000_000,
      now: options.now,
    }),
  };
}
