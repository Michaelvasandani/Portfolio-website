import { mkdir } from "node:fs/promises";

import { chromium } from "@playwright/test";

import { fixtureNames } from "../../src/renderer/fixtures";
import { startRendererServer } from "./server";

const server = await startRendererServer(3202);
const { origin } = server;
const screenshotDirectory = process.env.RENDERER_BASELINE_DIRECTORY ?? "evidence/ticket-03/screenshots";

try {
  await mkdir(screenshotDirectory, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const fixture of fixtureNames) {
      for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }]) {
        const page = await browser.newPage({ viewport });
        await page.goto(`${origin}/renderer-fixtures/${fixture}`, { waitUntil: "networkidle" });
        await page.screenshot({ path: `${screenshotDirectory}/${fixture}-${viewport.name}.png`, fullPage: true });
        const publicationDetails = page.locator(".publication-status__details");
        await publicationDetails.locator("summary").click();
        await page.screenshot({ path: `${screenshotDirectory}/${fixture}-${viewport.name}-publication-expanded.png`, fullPage: true });
        if (fixture === "typical") {
          await page.locator(".experience-entry").nth(1).locator("summary").click();
          await page.screenshot({ path: `${screenshotDirectory}/${fixture}-${viewport.name}-experience-expanded.png`, fullPage: true });
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`Captured ${fixtureNames.length * 4 + 2} renderer baseline screenshots.\n`);
} finally {
  server.stop();
}
