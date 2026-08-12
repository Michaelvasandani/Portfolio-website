import "server-only";

import { z } from "zod";

import { CareerIngestionMaintenance } from "./maintenance";
import { CareerIngestionService, type BlobUploadProvider, type CareerSandbox } from "./service";
import type { CareerIngestionStore } from "./store";

const runtimeConfigurationSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "preview", "production"]),
    CAREER_ALLOWED_EMAIL: z.email(),
    CAREER_ALLOWED_GITHUB: z.url(),
    CAREER_ALLOWED_LINKEDIN: z.url(),
  })
  .superRefine((value, context) => {
    const github = new URL(value.CAREER_ALLOWED_GITHUB);
    if (github.protocol !== "https:" || github.hostname !== "github.com") {
      context.addIssue({
        code: "custom",
        path: ["CAREER_ALLOWED_GITHUB"],
        message: "The GitHub allowlist entry must be an HTTPS github.com profile.",
      });
    }
    const linkedIn = new URL(value.CAREER_ALLOWED_LINKEDIN);
    if (
      linkedIn.protocol !== "https:" ||
      !["linkedin.com", "www.linkedin.com"].includes(linkedIn.hostname)
    ) {
      context.addIssue({
        code: "custom",
        path: ["CAREER_ALLOWED_LINKEDIN"],
        message: "The LinkedIn allowlist entry must be an HTTPS linkedin.com profile.",
      });
    }
  });

export type ManagedCareerIngestionAdapters = {
  store?: CareerIngestionStore;
  blob?: BlobUploadProvider;
  sandbox?: CareerSandbox;
};

export type CareerIngestionRuntime =
  | {
      available: true;
      configuration: {
        environment: "development" | "test" | "preview" | "production";
        contacts: { email: string; github: string; linkedin: string };
      };
      service: CareerIngestionService;
      maintenance: CareerIngestionMaintenance;
    }
  | { available: false; reason: string };

export function createCareerIngestionRuntime(
  source: Record<string, string | undefined>,
  adapters: ManagedCareerIngestionAdapters = {},
): CareerIngestionRuntime {
  const parsed = runtimeConfigurationSchema.safeParse(source);
  if (!parsed.success) {
    return { available: false, reason: "Career ingestion is not configured." };
  }
  if (!adapters.store || !adapters.blob || !adapters.sandbox) {
    return { available: false, reason: "Managed Career ingestion adapters are not connected." };
  }
  const configuration = {
    environment: parsed.data.APP_ENV,
    contacts: {
      email: parsed.data.CAREER_ALLOWED_EMAIL,
      github: parsed.data.CAREER_ALLOWED_GITHUB,
      linkedin: parsed.data.CAREER_ALLOWED_LINKEDIN,
    },
  };
  return {
    available: true,
    configuration,
    service: new CareerIngestionService({
      store: adapters.store,
      blob: adapters.blob,
      sandbox: adapters.sandbox,
      contacts: configuration.contacts,
    }),
    maintenance: new CareerIngestionMaintenance({ store: adapters.store, blob: adapters.blob }),
  };
}
