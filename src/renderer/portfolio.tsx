import Image from "next/image";

import type { DossierProjection } from "../agentic/dossier-publication";
import type { Contact, RendererFixture } from "./fixtures";
import { DossierIndex } from "./dossier-index";
import { ExperienceTimeline } from "./experience-timeline";
import { PublicationNote } from "./publication-note";

const sections = [
  ["I", "About", "about"],
  ["II", "Experience", "experience"],
  ["III", "Projects", "projects"],
  ["IV", "Résumé", "resume"],
  ["V", "Links", "links"],
] as const;

function ContactLinks({ contacts, location, conciseLabels = false }: {
  contacts: readonly Contact[];
  location: "card" | "links" | "closing";
  conciseLabels?: boolean;
}) {
  return (
    <div className={`contact-links contact-links--${location}`}>
      {contacts.map((contact) => {
        const label = conciseLabels
          ? { email: "Email", github: "GitHub", linkedin: "LinkedIn" }[contact.kind]
          : contact.label;
        const contactClass = conciseLabels
          ? `contact-link contact-link--${contact.kind === "email" ? "primary" : "secondary"} discrete-link meta`
          : "discrete-link meta";
        return (
          <a
            className={contactClass}
            href={contact.href}
            key={contact.kind}
            {...(conciseLabels ? { "aria-label": contact.label } : {})}
          >
            {label}
          </a>
        );
      })}
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

function LegacyPortfolio({ fixture }: { fixture: RendererFixture }) {
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
        <ContactLinks contacts={fixture.contacts} location="card" />
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
          <ContactLinks contacts={fixture.contacts} location="links" />
          <a className="discrete-link meta return-link" href="#top">Return to top <span aria-hidden="true">↑</span></a>
        </section>

        <PublicationNote fixture={fixture} />
      </main>
    </div>
  );
}

function DossierPortfolio({ projection, fixtureName }: { projection: DossierProjection; fixtureName?: string }) {
  const { card, about, experience, projects, capabilities, contact, statusStrip } = projection;
  const statusDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(statusStrip.lastUpdated));
  const statusTitle = {
    verified: "Portfolio verified by its agent",
    "stale-but-valid": "Portfolio still valid; source refresh is due",
    unavailable: "Publication status is temporarily unavailable",
  }[statusStrip.state];
  const statusLabels = {
    resumeSource: { approved: "Approved", stale: "Stale", unavailable: "Unavailable" },
    githubSource: { fresh: "Fresh", stale: "Stale", unavailable: "Unavailable" },
    publicationChecks: { passed: "Passed", unavailable: "Unavailable" },
  } as const;
  const stageDescriptions = {
    "Approved sources": "The approved résumé and public GitHub record are checked first.",
    "Evidence processing": "Relevant public project and experience evidence is shaped into the dossier.",
    "Publication checks": "The public result is checked before the validated deployment is served.",
    "Validated deployment": "The validated deployment serves the last successful public result.",
  } as const;
  return (
    <div className="folio folio--dossier" data-renderer-fixture={fixtureName ?? "dossier-v2"}>
      <a className="skip-link" href="#portfolio-content">Skip to portfolio content</a>

      <header className="card-view" id="top">
        <p className="meta card-location">{card.location}<br />{card.yearLabel}</p>
        <p className="meta card-status">{card.statusLines[0]}<br />{card.statusLines[1]}</p>
        <div className="identity">
          <p className="kicker">{card.kicker}</p>
          <h1>{card.name}</h1>
          <p className="role">{card.role}</p>
          <p className="proof">{card.proof}</p>
        </div>
        <ContactLinks contacts={card.contacts} location="card" />
        <a className="discrete-link meta enter-link" href="#about">Read the work <span aria-hidden="true">↓</span></a>
      </header>

      <main className="reading dossier-reading" id="portfolio-content">
        <DossierIndex />

        <section className="folio-section" id="about">
          <header className="section-heading">
            <span className="section-number" aria-hidden="true">I</span>
            <h2>About</h2>
          </header>
          <div className="about-layout">
            <div className="about-copy">
              <p className="lede">{about.lede}</p>
              <p className="body-copy">{about.body}</p>
            </div>
            {about.education.length ? (
              <div className="about-education">
                {about.education.map((education) => (
                  <article className="education-record" key={`${education.institution}-${education.degree}`}>
                    <p className="annotation meta">Education</p>
                    <h3>{education.degree}</h3>
                    <dl className="education-facts">
                      <div>
                        <dt>University</dt>
                        <dd>{education.institution}</dd>
                      </div>
                      <div>
                        <dt>Graduated</dt>
                        <dd>{education.graduationDate}</dd>
                      </div>
                      {education.gpa && !education.degree.includes(education.gpa) ? (
                        <div>
                          <dt>GPA</dt>
                          <dd>{education.gpa}</dd>
                        </div>
                      ) : null}
                      {education.courses.length ? (
                        <div>
                          <dt>Relevant courses</dt>
                          <dd>{education.courses.join(" · ")}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="folio-section" id="experience">
          <header className="section-heading">
            <span className="section-number" aria-hidden="true">II</span>
            <h2>Experience</h2>
          </header>
          <div className="entries">
            <ExperienceTimeline roles={experience} />
          </div>
        </section>

        <section className="folio-section" id="projects">
          <header className="section-heading">
            <span className="section-number" aria-hidden="true">III</span>
            <h2>Projects</h2>
          </header>
          <div className="entries">
            {projects.map((project) => (
              <article className={`entry project-entry project-entry--${project.prominence}`} key={project.repositoryHref}>
                <p className="entry-meta meta">{project.technologies.join(" · ")}</p>
                <div className="entry-content">
                  <h3>{project.name}</h3>
                  <p>{project.description}</p>
                  {project.bullets.length ? <ul>{project.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
                  <div className="project-artifact" data-artifact-kind={project.artifact.kind}>
                    <p className="meta">Evidence artifact · typeset repository</p>
                    {project.artifact.kind === "typeset-repository" ? (
                      <>
                        <h4>{project.artifact.repositoryName}</h4>
                        <p>{project.artifact.description ?? "No public repository description supplied."}</p>
                        <dl className="artifact-facts">
                          <div><dt>Language</dt><dd>{project.artifact.language ?? "Not specified"}</dd></div>
                          {project.artifact.topics.length ? <div><dt>Topics</dt><dd>{project.artifact.topics.join(" · ")}</dd></div> : null}
                          {project.artifact.metadata.lastUpdated ? <div><dt>Updated</dt><dd>{project.artifact.metadata.lastUpdated}</dd></div> : null}
                          <div><dt>Releases</dt><dd>{project.artifact.metadata.releaseCount}</dd></div>
                        </dl>
                      </>
                    ) : <Image src={project.artifact.src} alt={project.artifact.alt} width={960} height={540} />}
                  </div>
                  <div className="project-actions">
                    <a className="discrete-link project-link meta" href={project.repositoryHref}>View {project.name} repository</a>
                    {project.demonstrationHref ? <a className="discrete-link project-link meta" href={project.demonstrationHref}>Open verified {project.name} demonstration</a> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="folio-section" id="skills">
          <header className="section-heading">
            <span className="section-number" aria-hidden="true">IV</span>
            <h2>Skills &amp; Tools</h2>
          </header>
          <div className="capability-groups">
            {capabilities.map((group) => {
              const headingId = `capability-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              return (
                <article className="capability-group" key={group.name} aria-labelledby={headingId}>
                  <h3 id={headingId}>{group.name}</h3>
                  <p className="capability-toolkit"><span className="meta">Toolkit</span> {group.tools.join(" · ")}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="folio-section" id="contact">
          <header className="section-heading">
            <span className="section-number" aria-hidden="true">V</span>
            <h2>Contact</h2>
          </header>
          <p className="lede">{contact.prompt}</p>
          <ContactLinks contacts={contact.contacts} location="closing" conciseLabels />
          <div className="actions">
            <a className="discrete-link" href={contact.resumeHtmlPath}>Read the complete résumé in HTML</a>
            <a className="discrete-link" href={contact.resumePdfPath} download>Download résumé as tagged PDF</a>
          </div>
        </section>

        <footer className={`publication-note publication-status publication-status--${statusStrip.state}`} aria-label="Publication status" data-publication-status={statusStrip.state}>
          <div className="publication-status__heading">
            <p className="publication-status__title">{statusTitle}</p>
            <p className="publication-status__updated">Latest successful update · <time dateTime={statusStrip.lastUpdated}>{statusDate}</time></p>
          </div>
          <dl className="publication-status__facts">
            <div><dt>Résumé source</dt><dd>{statusLabels.resumeSource[statusStrip.resumeSource]}</dd></div>
            <div><dt>GitHub source</dt><dd>{statusLabels.githubSource[statusStrip.githubSource]}</dd></div>
            <div><dt>Check result</dt><dd>{statusLabels.publicationChecks[statusStrip.publicationChecks]}</dd></div>
          </dl>
          <details className="publication-status__details">
            <summary>How publication is verified</summary>
            <ol>{statusStrip.stages.map((stage) => <li key={stage}><strong>{stage}.</strong> {stageDescriptions[stage]}</li>)}</ol>
          </details>
          <p className="publication-status__hash"><span className="visually-hidden">Public manifest hash: </span><code>{statusStrip.publicManifestHash}</code></p>
        </footer>
      </main>
    </div>
  );
}

export function Portfolio({ fixture, fixtureName }: { fixture: RendererFixture | DossierProjection; fixtureName?: string }) {
  if ("schemaVersion" in fixture) return <DossierPortfolio projection={fixture} fixtureName={fixtureName} />;
  return <LegacyPortfolio fixture={fixture} />;
}
