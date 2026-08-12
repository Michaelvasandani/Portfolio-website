import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

import { fixtureNames } from "../../src/renderer/fixtures";
import { startRendererServer } from "./server";

const server = await startRendererServer(3199);
const { origin } = server;

try {
  await mkdir(resolve("public"), { recursive: true });
  await mkdir(resolve("evidence/ticket-03/pdfs"), { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const fixture of fixtureNames) {
      const page = await browser.newPage();
      const route = fixture === "typical" ? "/resume" : `/renderer-fixtures/${fixture}/resume`;
      const output = fixture === "typical" ? resolve("public/michael-vasandani-resume.pdf") : resolve(`evidence/ticket-03/pdfs/${fixture}.pdf`);
      await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      await page.pdf({ path: output, format: "Letter", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, tagged: true, outline: true });
      execFileSync("python3", ["scripts/renderer/finish_pdfua.py", output], { stdio: "inherit" });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`Generated ${fixtureNames.length} tagged Public résumé fixture PDFs.\n`);
} finally {
  server.stop();
}
