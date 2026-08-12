import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  fixtureNames,
  getRendererFixture,
  type RendererFixture,
  type RendererFixtureName,
} from "../../src/renderer/fixtures";

function normalizePdfText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1-$2")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedResumeText(fixture: RendererFixture): string {
  const parts = [
    "PUBLIC RÉSUMÉ",
    `${fixture.name} - Résumé`,
    fixture.location,
    ...fixture.contacts.map(({ label }) => label),
    "Experience",
    ...fixture.experience.flatMap((role) => [
      `${role.title} - ${role.organization}`,
      `${role.location ? `${role.location} · ` : ""}${role.dates}`,
      ...role.bullets.map((bullet) => `• ${bullet}`),
    ]),
    "Education",
    ...fixture.education.flatMap((item) => [
      item.institution,
      item.degree,
      item.dates,
      item.gpa && !item.degree.includes(item.gpa) ? `GPA: ${item.gpa}` : undefined,
      item.coursework?.length ? `Coursework: ${item.coursework.join(", ")}` : undefined,
      ...(item.details ?? []),
    ]),
    "Projects",
    ...fixture.careerProjects.flatMap((project) => [
      project.name,
      project.technologies.join(", "),
      project.repositoryHref ? `View ${project.name} repository` : undefined,
      ...project.bullets.map((bullet) => `• ${bullet}`),
    ]),
    "Technical Skills",
    ...fixture.skills.map((group) => `${group.name}: ${group.items.join(", ")}`),
    ...fixture.optionalSections.flatMap((section) => [
      section.heading,
      ...section.items.map((item) => `• ${item}`),
    ]),
    `LAST UPDATED ${new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(fixture.lastUpdated)).toUpperCase()}`,
    fixture.manifestHash,
  ];

  return normalizePdfText(parts.filter((part): part is string => Boolean(part)).join("\n"));
}

function pdfPathFor(fixture: RendererFixtureName): string {
  return resolve(fixture === "typical"
    ? "public/michael-vasandani-resume.pdf"
    : `evidence/ticket-03/pdfs/${fixture}.pdf`);
}

let structuralChecks = 0;
for (const fixtureName of fixtureNames) {
  const fixture = getRendererFixture(fixtureName);
  const pdfPath = pdfPathFor(fixtureName);
  const pdf = readFileSync(pdfPath);
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const extracted = normalizePdfText(execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" }));
  const expected = expectedResumeText(fixture);

  if (extracted !== expected) {
    let mismatch = 0;
    while (mismatch < extracted.length && extracted[mismatch] === expected[mismatch]) mismatch += 1;
    throw new Error([
      `${fixtureName} PDF does not exactly match its visible résumé source at character ${mismatch}.`,
      `Expected: ${expected.slice(Math.max(0, mismatch - 80), mismatch + 160)}`,
      `Actual:   ${extracted.slice(Math.max(0, mismatch - 80), mismatch + 160)}`,
    ].join("\n"));
  }

  const checks = [
    ["PDF header", pdf.subarray(0, 5).toString() === "%PDF-"],
    ["selectable text", extracted.length > 100],
    ["document title", /Title:\s+Michael Sagar Vasandani .* Public Résumé/i.test(info)],
    ["document language", /Tagged:\s+yes/i.test(info) && pdf.includes(Buffer.from("/Lang (en)"))],
    ["structural tags", /Tagged:\s+yes/i.test(info) && pdf.includes(Buffer.from("/StructTreeRoot"))],
    ["embedded Source Serif font", /SourceSerif/i.test(execFileSync("pdffonts", [pdfPath], { encoding: "utf8" }))],
  ] as const;

  for (const [name, passed] of checks) {
    if (!passed) throw new Error(`${fixtureName} résumé PDF check failed: ${name}`);
  }
  structuralChecks += checks.length;
}

process.stdout.write(`${fixtureNames.length} résumé fixture PDFs exactly match their visible source and passed ${structuralChecks} structural checks.\n`);
