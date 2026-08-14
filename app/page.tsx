import { getRendererFixture } from "@/src/renderer/fixtures";
import { Portfolio } from "@/src/renderer/portfolio";
import { readLatestPublishedPortfolio } from "@/src/agentic/server";
import { connection } from "next/server";

export default async function PortfolioPage() {
  await connection();
  const fixture = await readLatestPublishedPortfolio().catch(() => null) ?? getRendererFixture("typical");
  const identity = "schemaVersion" in fixture
    ? { name: fixture.card.name, contacts: fixture.card.contacts, role: fixture.card.role, lastUpdated: fixture.statusStrip.lastUpdated }
    : { name: fixture.name, contacts: fixture.contacts, role: fixture.role, lastUpdated: fixture.lastUpdated };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: "Michael Vasandani — AI Engineering Portfolio",
    url: "https://michaelvasandani.com/",
    dateModified: identity.lastUpdated,
    mainEntity: {
      "@type": "Person",
      name: identity.name,
      url: "https://michaelvasandani.com/",
      email: identity.contacts.find(({ kind }) => kind === "email")?.href,
      sameAs: identity.contacts.filter(({ kind }) => kind !== "email").map(({ href }) => href),
      jobTitle: identity.role,
    },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Portfolio fixture={fixture} />
    </>
  );
}
