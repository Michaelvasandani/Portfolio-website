import { getRendererFixture } from "@/src/renderer/fixtures";
import { Portfolio } from "@/src/renderer/portfolio";

const fixture = getRendererFixture("typical");

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  name: "Michael Vasandani — AI Engineering Portfolio",
  url: "https://michaelvasandani.com/",
  dateModified: fixture.lastUpdated,
  mainEntity: {
    "@type": "Person",
    name: fixture.name,
    url: "https://michaelvasandani.com/",
    email: fixture.contacts.find(({ kind }) => kind === "email")?.href,
    sameAs: fixture.contacts.filter(({ kind }) => kind !== "email").map(({ href }) => href),
    jobTitle: fixture.role,
  },
};

export default function PortfolioPage() {
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
