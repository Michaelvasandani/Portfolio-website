import { mkdir } from "node:fs/promises";

import { chromium } from "@playwright/test";

import { fixtureNames } from "../../src/renderer/fixtures";
import { startRendererServer } from "./server";

const server = await startRendererServer(3202);
const { origin } = server;

try {
  await mkdir("evidence/ticket-03/screenshots", { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const fixture of fixtureNames) {
      for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }]) {
        const page = await browser.newPage({ viewport });
        await page.goto(`${origin}/renderer-fixtures/${fixture}`, { waitUntil: "networkidle" });
        await page.screenshot({ path: `evidence/ticket-03/screenshots/${fixture}-${viewport.name}.png`, fullPage: true });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`Captured ${fixtureNames.length * 2} renderer baseline screenshots.\n`);
} finally {
  server.stop();
}
