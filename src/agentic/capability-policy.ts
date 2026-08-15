import type { SkillGroup } from "../renderer/fixtures";

export const capabilityGroupNames = [
  "AI Systems",
  "Backend & APIs",
  "Data & ML",
  "Product Interfaces",
  "Infrastructure",
] as const;

export type CapabilityGroupName = (typeof capabilityGroupNames)[number];

const skillToCapability: ReadonlyMap<string, CapabilityGroupName> = new Map([
  ["langgraph", "AI Systems"],
  ["ollama", "AI Systems"],
  ["langchain", "AI Systems"],
  ["hugging face transformers", "AI Systems"],
  ["java", "Backend & APIs"],
  ["python", "Backend & APIs"],
  ["c++", "Backend & APIs"],
  ["sql", "Backend & APIs"],
  ["javascript", "Backend & APIs"],
  ["typescript", "Backend & APIs"],
  ["node.js", "Backend & APIs"],
  ["fastapi", "Backend & APIs"],
  ["pydantic", "Backend & APIs"],
  ["r", "Data & ML"],
  ["pinecone", "Data & ML"],
  ["pgvector", "Data & ML"],
  ["pandas", "Data & ML"],
  ["numpy", "Data & ML"],
  ["scikit-learn", "Data & ML"],
  ["pytorch", "Data & ML"],
  ["tensorflow", "Data & ML"],
  ["html/css", "Product Interfaces"],
  ["react", "Product Interfaces"],
  ["angular", "Product Interfaces"],
  ["material-ui", "Product Interfaces"],
  ["git", "Infrastructure"],
  ["github actions", "Infrastructure"],
  ["docker", "Infrastructure"],
  ["kubernetes", "Infrastructure"],
  ["aws", "Infrastructure"],
  ["gcp", "Infrastructure"],
]);

export type CapabilityGroup = {
  name: CapabilityGroupName;
  tools: string[];
};

function skillKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function projectCapabilityGroups(skills: readonly SkillGroup[]): CapabilityGroup[] {
  const toolsByCapability = new Map<CapabilityGroupName, string[]>();
  const seenSkills = new Set<string>();

  for (const group of skills) {
    for (const tool of group.items) {
      const key = skillKey(tool);
      const capability = skillToCapability.get(key);
      if (!capability || seenSkills.has(key)) continue;
      seenSkills.add(key);
      toolsByCapability.set(capability, [...(toolsByCapability.get(capability) ?? []), tool]);
    }
  }

  return capabilityGroupNames.flatMap((name) => {
    const tools = toolsByCapability.get(name);
    return tools?.length ? [{ name, tools }] : [];
  });
}
