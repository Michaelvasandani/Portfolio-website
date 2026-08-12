import { notFound } from "next/navigation";

import { fixtureNames, getRendererFixture, isRendererFixtureName } from "@/src/renderer/fixtures";
import { Portfolio } from "@/src/renderer/portfolio";

export const dynamicParams = false;

export function generateStaticParams() {
  return fixtureNames.map((fixture) => ({ fixture }));
}

export default async function RendererFixturePage({ params }: { params: Promise<{ fixture: string }> }) {
  const { fixture } = await params;
  if (!isRendererFixtureName(fixture)) notFound();
  return <Portfolio fixture={getRendererFixture(fixture)} />;
}
