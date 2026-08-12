import type { RendererFixture } from "./fixtures";
import { PublicationNote } from "./publication-note";

const sections = [
  ["I", "About", "about"],
  ["II", "Experience", "experience"],
  ["III", "Projects", "projects"],
  ["IV", "Résumé", "resume"],
  ["V", "Links", "links"],
] as const;

function ContactLinks({ fixture, location }: { fixture: RendererFixture; location: "card" | "links" }) {
  return (
    <div className={`contact-links contact-links--${location}`}>
      {fixture.contacts.map((contact) => (
        <a className="discrete-link meta" href={contact.href} key={contact.kind}>
          {contact.label}
        </a>
      ))}
    </div>
  );
}

type SectionId = (typeof sections)[number][2];

function SectionHeader({ sectionId }: { sectionId: SectionId }) {
  const section = sections.find(([, , id]) => id === sectionId)!;
  return (
    <header className="section-heading">
      <span className="section-number" aria-hidden="true">{section[0]}</span>
      <h2>{section[1]}</h2>
    </header>
  );
}

export function Portfolio({ fixture }: { fixture: RendererFixture }) {
  return (
    <div className="folio" data-renderer-fixture={fixture.fixture}>
      <a className="skip-link" href="#portfolio-content">Skip to portfolio content</a>

      <header className="card-view" id="top">
        <p className="meta card-location">{fixture.location}<br />Portfolio · 2026</p>
        <p className="meta card-status">AI systems<br />Software engineering</p>
        <div className="identity">
          <p className="kicker">Engineer of dependable agentic systems</p>
          <h1>{fixture.name}</h1>
          <p className="role">{fixture.role}</p>
          <p className="proof">{fixture.cardProof}</p>
        </div>
        <ContactLinks fixture={fixture} location="card" />
        <a className="discrete-link meta enter-link" href="#about">Read the work <span aria-hidden="true">↓</span></a>
      </header>

      <main className="reading" id="portfolio-content">
        <section className="folio-section" id="about">
          <SectionHeader sectionId="about" />
          <p className="lede">{fixture.aboutLede}</p>
          <p className="body-copy">{fixture.aboutBody}</p>
        </section>

        <section className="folio-section" id="experience">
          <SectionHeader sectionId="experience" />
          <div className="entries">
            {fixture.experience.map((role) => (
              <article className="entry" key={`${role.organization}-${role.title}-${role.dates}`}>
                <div className="entry-meta meta">
                  <p>{role.dates}</p>
                  {role.location ? <p>{role.location}</p> : null}
                </div>
                <div className="entry-content">
                  <h3>{role.title}<span>{role.organization}</span></h3>
                  <ul>{role.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="folio-section" id="projects">
          <SectionHeader sectionId="projects" />
          <div className="entries">
            {fixture.projects.map((project) => (
              <article className="entry project-entry" key={project.repositoryHref}>
                <p className="entry-meta meta">{project.technologies.join(" · ")}</p>
                <div className="entry-content">
                  <h3>{project.name}</h3>
                  <p>{project.description}</p>
                  {project.bullets.length ? <ul>{project.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
                  <a className="discrete-link project-link meta" href={project.repositoryHref}>View {project.name} repository</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="folio-section" id="resume">
          <SectionHeader sectionId="resume" />
          {fixture.education.map((item) => (
            <article className="resume-group" key={`${item.institution}-${item.degree}`}>
              <p className="meta">Education</p>
              <div>
                <h3>{item.degree}</h3>
                <p>{item.institution} · {item.dates}</p>
                {item.gpa && !item.degree.includes(item.gpa) ? <p><strong>GPA:</strong> {item.gpa}</p> : null}
                {item.coursework?.length ? <p><strong>Coursework:</strong> {item.coursework.join(", ")}</p> : null}
                {item.details?.map((detail) => <p key={detail}>{detail}</p>)}
              </div>
            </article>
          ))}
          {fixture.skills.map((group) => (
            <div className="resume-row" key={group.name}>
              <h3>{group.name}</h3><p>{group.items.join(", ")}</p>
            </div>
          ))}
          {fixture.optionalSections.map((section) => (
            <section className="resume-optional" key={section.heading} aria-labelledby={`optional-${section.heading.toLowerCase()}`}>
              <h3 id={`optional-${section.heading.toLowerCase()}`}>{section.heading}</h3>
              <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ))}
          <div className="actions">
            <a className="discrete-link" href="/resume">Read the complete résumé in HTML</a>
            <a className="discrete-link" href="/michael-vasandani-resume.pdf" download>Download résumé as tagged PDF</a>
          </div>
        </section>

        <section className="folio-section" id="links">
          <SectionHeader sectionId="links" />
          <ContactLinks fixture={fixture} location="links" />
          <a className="discrete-link meta return-link" href="#top">Return to top <span aria-hidden="true">↑</span></a>
        </section>

        <PublicationNote fixture={fixture} />
      </main>
    </div>
  );
}
