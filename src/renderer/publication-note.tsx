import type { RendererFixture } from "./fixtures";

export function PublicationNote({ fixture }: { fixture: RendererFixture }) {
  return (
    <footer className="publication-note">
      <p>Last updated <time dateTime={fixture.lastUpdated}>{new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(fixture.lastUpdated))}</time></p>
      <p><span className="visually-hidden">Public manifest hash: </span><code>{fixture.manifestHash}</code></p>
    </footer>
  );
}
