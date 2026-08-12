import { z } from "zod";

const fixtureSchema = z
  .object({
    id: z.string().regex(/^(CAR|GIT|SEL|GEN|RND|CHK|PUB)-V1-\d{3}$/),
    version: z.literal("1.0.0"),
    area: z.enum(["career", "github", "selection", "generation", "rendering", "checks", "publication"]),
    input: z.record(z.string(), z.unknown()),
    expected: z
      .object({
        decision: z.string().min(1),
        assertions: z.array(z.string().min(1)).min(1),
      })
      .strict(),
  })
  .strict();

export const fixtureCatalogSchema = z.array(fixtureSchema).length(51).superRefine((fixtures, context) => {
  const ids = fixtures.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "fixture IDs must be unique and immutable" });
  }
});

export type ContractFixture = z.infer<typeof fixtureSchema>;

export function parseFixtureCatalog(input: unknown): ContractFixture[] {
  return fixtureCatalogSchema.parse(input);
}
