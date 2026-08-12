export const operationalSections = [
  { slug: "upload", label: "Upload" },
  { slug: "publication-runs", label: "Publication runs" },
  { slug: "deployments", label: "Deployments" },
  { slug: "checks", label: "Checks" },
  { slug: "served-version", label: "Served version" },
  { slug: "breaker", label: "Circuit breaker" },
  { slug: "restore-retry", label: "Restore and retry" },
  { slug: "source-freshness", label: "Source freshness" },
  { slug: "raw-deletion", label: "Raw deletion" },
  { slug: "outbox", label: "Outbox" },
  { slug: "notifications", label: "Notifications" },
] as const;

export type OperationalSectionSlug = (typeof operationalSections)[number]["slug"];
export type OperationalShellState = "empty" | "loading" | "error" | "unavailable";

export type OperationalShellView = {
  slug: OperationalSectionSlug;
  label: string;
  state: OperationalShellState;
  summary: string;
  records: Array<{ label: string; value: string }>;
};

export interface OperationalRepository {
  read(slug: OperationalSectionSlug): Promise<OperationalShellView>;
}

function sectionFor(slug: OperationalSectionSlug) {
  return operationalSections.find((section) => section.slug === slug)!;
}

export class UnavailableOperationalRepository implements OperationalRepository {
  constructor(private readonly reason: string) {}

  async read(slug: OperationalSectionSlug): Promise<OperationalShellView> {
    const section = sectionFor(slug);
    return {
      slug,
      label: section.label,
      state: "unavailable",
      summary: this.reason,
      records: [],
    };
  }
}

export function isOperationalSection(value: string): value is OperationalSectionSlug {
  return operationalSections.some(({ slug }) => slug === value);
}
