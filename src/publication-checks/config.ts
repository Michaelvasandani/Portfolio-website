import configuration from "../../config/publication-checks.v1.json";
import { canonicalJson, sha256 } from "../github/canonical";
import type { NormativeConfiguration, Sha256 } from "./contracts";

export const NORMATIVE_CONFIG_HASH = "sha256:e76c65695e08dadb1ebb6f3069ca70651a9dbc85af5712225423672fccf6d405" as Sha256;

export function configurationHash(value: unknown): Sha256 {
  return sha256(canonicalJson(value));
}

export function loadNormativeConfiguration(
  value: unknown = configuration,
  expectedHash: Sha256 = NORMATIVE_CONFIG_HASH,
): NormativeConfiguration {
  const actual = configurationHash(value);
  if (actual !== expectedHash) throw new Error(`Normative configuration hash mismatch: expected ${expectedHash}, received ${actual}.`);
  const parsed = structuredClone(value) as NormativeConfiguration;
  if (parsed.schemaVersion !== 1 || parsed.retry.maximumRetries !== 2 || !parsed.retry.cleanEnvironmentEachAttempt || parsed.retry.attemptTimeoutMs <= 0) {
    throw new Error("Normative configuration contract is invalid.");
  }
  return parsed;
}

export function mutableNormativeConfigurationFixture(): NormativeConfiguration {
  return structuredClone(configuration) as NormativeConfiguration;
}
