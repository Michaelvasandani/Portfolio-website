import { notFound } from "next/navigation";

import { buildDossierProjection } from "@/src/agentic/dossier-publication";
import { fixtureNames, getRendererFixture, isRendererFixtureName } from "@/src/renderer/fixtures";
import { Portfolio } from "@/src/renderer/portfolio";

export const dynamicParams = false;

export function generateStaticParams() {
  return fixtureNames.map((fixture) => ({ fixture }));
}

export default async function RendererFixturePage({ params }: { params: Promise<{ fixture: string }> }) {
  const { fixture } = await params;
  if (!isRendererFixtureName(fixture)) notFound();
  const base = getRendererFixture(fixture);
  return <Portfolio fixture={buildDossierProjection({ base, publishedAt: base.lastUpdated })} fixtureName={fixture} />;
}
