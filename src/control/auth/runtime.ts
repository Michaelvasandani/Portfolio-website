import "server-only";

import { UnavailableOperationalRepository, type OperationalRepository } from "../operations";
import { loadOwnerAccessConfiguration, type LoadedOwnerAccessConfiguration } from "./config";
import { GitHubOAuthIdentityProvider } from "./github";
import { OwnerAccessService } from "./service";
import { InMemoryOwnerAccessStore, type OwnerAccessStore } from "./store";

export type OwnerAccessRuntime =
  | {
      available: true;
      configuration: LoadedOwnerAccessConfiguration;
      service: OwnerAccessService;
      operations: OperationalRepository;
    }
  | { available: false; reason: string };

export function createOwnerAccessRuntime(
  source: Record<string, string | undefined>,
  persistentStore?: OwnerAccessStore,
): OwnerAccessRuntime {
  let configuration: LoadedOwnerAccessConfiguration;
  try {
    configuration = loadOwnerAccessConfiguration(source);
  } catch {
    return { available: false, reason: "Owner access is not configured." };
  }

  const local = configuration.environment === "development" || configuration.environment === "test";
  if (!local && !persistentStore) {
    return { available: false, reason: "Persistent owner-access storage is not connected." };
  }
  const store = persistentStore ?? new InMemoryOwnerAccessStore();
  const provider = new GitHubOAuthIdentityProvider({
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    callbackUrl: configuration.callbackUrl,
  });
  return {
    available: true,
    configuration,
    service: new OwnerAccessService({ config: configuration, store, provider }),
    operations: new UnavailableOperationalRepository(
      "Managed control-plane persistence is not connected; no operational result is available.",
    ),
  };
}
