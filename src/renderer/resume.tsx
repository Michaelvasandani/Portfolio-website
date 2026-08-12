import type { RendererFixture } from "./fixtures";
import { PublicationNote } from "./publication-note";

export function PublicResume({ fixture }: { fixture: RendererFixture }) {
  return (
    <main className="resume-document" data-renderer-fixture={fixture.fixture} id="resume-content">
      <header className="resume-header">
        <p className="kicker">Public résumé</p>
        <h1>{fixture.name} — Résumé</h1>
        <p>{fixture.location}</p>
        <nav aria-label="Résumé contact links">
          {fixture.contacts.map((contact) => <a className="discrete-link" href={contact.href} key={contact.kind}>{contact.label}</a>)}
        </nav>
        <a className="discrete-link download-link" href="/michael-vasandani-resume.pdf" download>Download résumé as tagged PDF</a>
      </header>

      <section aria-labelledby="resume-experience">
        <h2 id="resume-experience">Experience</h2>
        {fixture.experience.map((role) => (
          <article key={`${role.organization}-${role.title}-${role.dates}`}>
            <h3>{role.title} — {role.organization}</h3>
            <p>{role.location ? `${role.location} · ` : ""}{role.dates}</p>
            <ul>{role.bullets.map((bullet) => <li key={bullet}>• {bullet}</li>)}</ul>
          </article>
        ))}
      </section>

      <section aria-labelledby="resume-education">
        <h2 id="resume-education">Education</h2>
        {fixture.education.map((item) => (
          <article key={`${item.institution}-${item.degree}`}>
            <h3>{item.institution}</h3>
            <p>{item.degree}</p>
            <p>{item.dates}</p>
            {item.gpa && !item.degree.includes(item.gpa) ? <p><strong>GPA:</strong> {item.gpa}</p> : null}
            {item.coursework?.length ? <p><strong>Coursework:</strong> {item.coursework.join(", ")}</p> : null}
            {item.details?.map((detail) => <p key={detail}>{detail}</p>)}
          </article>
        ))}
      </section>

      <section aria-labelledby="resume-projects">
        <h2 id="resume-projects">Projects</h2>
        {fixture.careerProjects.map((project) => (
          <article key={project.name}>
            <h3>{project.name}</h3>
            <p>{project.technologies.join(", ")}</p>
            {project.repositoryHref ? <p><a href={project.repositoryHref}>View {project.name} repository</a></p> : null}
            <ul>{project.bullets.map((bullet) => <li key={bullet}>• {bullet}</li>)}</ul>
          </article>
        ))}
      </section>

      <section aria-labelledby="resume-skills">
        <h2 id="resume-skills">Technical Skills</h2>
        {fixture.skills.map((group) => <p key={group.name}><strong>{group.name}:</strong> {group.items.join(", ")}</p>)}
      </section>

      {fixture.optionalSections.map((section) => (
        <section key={section.heading} aria-labelledby={`resume-${section.heading.toLowerCase()}`}>
          <h2 id={`resume-${section.heading.toLowerCase()}`}>{section.heading}</h2>
          <ul>{section.items.map((item) => <li key={item}>• {item}</li>)}</ul>
        </section>
      ))}

      <PublicationNote fixture={fixture} />
    </main>
  );
}
