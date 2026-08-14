import "server-only";

import { neon } from "@neondatabase/serverless";

import { getRendererFixture, type RendererFixture } from "../renderer/fixtures";
import { runPortfolioAgent } from "./portfolio-agent";
import { createPortfolioPublicationStore } from "./publication-store";
import { collectGitHubRepositories, generatePortfolioDraft } from "./runtime";

function databaseStore(source: Record<string, string | undefined> = process.env) {
  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl?.startsWith("postgresql://")) return null;
  const sql = neon(databaseUrl);
  return createPortfolioPublicationStore(async (text, parameters = []) => {
    const rows = await sql.query(text, parameters);
    return rows as Record<string, unknown>[];
  });
}

export async function readLatestPublishedPortfolio(
  source: Record<string, string | undefined> = process.env,
): Promise<RendererFixture | null> {
  return (await databaseStore(source)?.latest()) ?? null;
}

export async function runProductionPortfolioAgent(
  source: Record<string, string | undefined> = process.env,
) {
  const store = databaseStore(source);
  const token = source.AI_GATEWAY_API_KEY ?? source.VERCEL_OIDC_TOKEN ?? source.MODEL_API_KEY;
  if (!store) throw new Error("agent-database-unavailable");
  if (!token) throw new Error("agent-model-unavailable");

  return runPortfolioAgent({
    collect: () => collectGitHubRepositories({ username: source.GITHUB_OWNER ?? "Michaelvasandani" }),
    generate: (repositories) => generatePortfolioDraft({
      repositories,
      career: getRendererFixture("typical"),
      token,
      model: source.PORTFOLIO_MODEL ?? "openai/gpt-5.4-mini",
    }),
    publish: (fixture, evidence) => store.publish(fixture, evidence),
    base: getRendererFixture("typical"),
  });
}
