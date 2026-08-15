"use client";

import { useEffect, useState } from "react";

const sections = [
  ["about", "About"],
  ["experience", "Experience"],
  ["projects", "Projects"],
  ["skills", "Skills & Tools"],
  ["contact", "Contact"],
] as const;

type SectionId = (typeof sections)[number][0];

function currentSection(): SectionId {
  const index = document.querySelector<HTMLElement>("[data-dossier-index]");
  const offset = (index?.getBoundingClientRect().height ?? 0) + 64;
  const visibleSections = sections
    .map(([id]) => document.getElementById(id))
    .filter((section): section is HTMLElement => section !== null)
    .filter((section) => section.getBoundingClientRect().top <= offset);

  return (visibleSections.at(-1)?.id ?? sections[0][0]) as SectionId;
}

export function DossierIndex() {
  const [activeSection, setActiveSection] = useState<SectionId>(sections[0][0]);

  useEffect(() => {
    const updateCurrentSection = () => setActiveSection(currentSection());
    updateCurrentSection();
    window.addEventListener("scroll", updateCurrentSection, { passive: true });
    window.addEventListener("resize", updateCurrentSection);

    return () => {
      window.removeEventListener("scroll", updateCurrentSection);
      window.removeEventListener("resize", updateCurrentSection);
    };
  }, []);

  return (
    <nav className="dossier-index" data-dossier-index aria-label="Dossier index">
      <ul className="dossier-index__list">
        {sections.map(([id, label]) => (
          <li key={id}>
            <a
              className="dossier-index__link"
              href={`#${id}`}
              aria-current={activeSection === id ? "location" : undefined}
              onClick={() => setActiveSection(id)}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
      <div className="dossier-index__actions" aria-label="Public résumé">
        <a className="dossier-index__action discrete-link" href="/resume">Public résumé</a>
        <a className="dossier-index__action discrete-link" href="/michael-vasandani-resume.pdf" download>Tagged PDF</a>
      </div>
    </nav>
  );
}
