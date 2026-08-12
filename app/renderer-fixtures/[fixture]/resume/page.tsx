import { notFound } from "next/navigation";

import { fixtureNames, getRendererFixture, isRendererFixtureName } from "@/src/renderer/fixtures";
import { PublicResume } from "@/src/renderer/resume";

export const dynamicParams = false;

export function generateStaticParams() {
  return fixtureNames.filter((fixture) => fixture !== "typical").map((fixture) => ({ fixture }));
}

export default async function RendererResumeFixturePage({ params }: { params: Promise<{ fixture: string }> }) {
  const { fixture } = await params;
  if (!isRendererFixtureName(fixture) || fixture === "typical") notFound();
  return <PublicResume fixture={getRendererFixture(fixture)} />;
}
