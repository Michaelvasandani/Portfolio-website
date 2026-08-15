"use client";

import { useEffect } from "react";

import type { DossierProjection } from "../agentic/dossier-publication";

type ExperienceRole = DossierProjection["experience"][number];

function focusHashRole() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id.startsWith("role-")) return;
  const details = document.getElementById(id);
  if (!(details instanceof HTMLDetailsElement)) return;
  details.open = true;
  details.querySelector("summary")?.focus({ preventScroll: true });
  details.scrollIntoView({ block: "start" });
}

export function ExperienceTimeline({ roles }: { roles: readonly ExperienceRole[] }) {
  useEffect(() => {
    document.querySelectorAll<HTMLDetailsElement>(".experience-entry").forEach((details, index) => {
      details.open = index === 0;
    });
    const frame = window.requestAnimationFrame(focusHashRole);
    window.addEventListener("hashchange", focusHashRole);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", focusHashRole);
    };
  }, []);

  return roles.map((role) => (
    <details className="entry experience-entry" id={role.id} key={role.id} open>
      <summary className="entry-summary">
        <div className="entry-meta meta">
          <p>{role.dates}</p>
          {role.location ? <p>{role.location}</p> : null}
        </div>
        <div className="entry-content">
          <h3>{role.title}<span>{role.organization}</span></h3>
          <p className="role-summary">{role.summary}</p>
        </div>
      </summary>
      <div className="entry-detail">
        <p>{role.narrative}</p>
        {role.evidenceCallouts.length ? (
          <ul aria-label={`${role.organization} evidence callouts`}>
            {role.evidenceCallouts.map((callout) => <li key={`${callout.label}-${callout.value}`}>{callout.label}: {callout.value}</li>)}
          </ul>
        ) : null}
      </div>
    </details>
  ));
}
