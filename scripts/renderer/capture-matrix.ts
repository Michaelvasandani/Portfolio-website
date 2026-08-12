import { readFileSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

import { startRendererServer } from "./server";

const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const routes = ["/", "/resume", "/renderer-fixtures/sparse", "/renderer-fixtures/dense"];
const server = await startRendererServer(3202);
const browser = await chromium.launch();

try {
  const entries = [];
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      try {
        const response = await page.goto(`${server.origin}${route}`, { waitUntil: "networkidle" });
        await page.addScriptTag({ content: axeSource });
        entries.push(await page.evaluate(async ({ requestedRoute, status }) => {
          const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> } }).axe;
          const violations = (await axe.run()).violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length }));
          const main = document.querySelector("main");
          return {
            route: requestedRoute,
            status,
            title: document.title,
            language: document.documentElement.lang,
            headings: [...document.querySelectorAll("h1, h2, h3")].map(({ tagName, textContent }) => ({ level: tagName, text: textContent?.trim() })),
            fixture: main?.getAttribute("data-renderer-fixture") ?? "typical",
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            clippedElements: [...document.querySelectorAll("main *")].filter((element) => {
              const style = getComputedStyle(element);
              return !element.classList.contains("visually-hidden") && style.overflow === "hidden" && element.scrollHeight > element.clientHeight;
            }).length,
            axeViolations: violations,
          };
        }, { requestedRoute: route, status: response?.status() ?? 0 }));
      } finally {
        await page.close();
      }
    }
  }

  if (entries.some(({ status, horizontalOverflow, clippedElements, axeViolations }) => status !== 200 || horizontalOverflow || clippedElements > 0 || axeViolations.length > 0)) {
    throw new Error("DOM, layout, and accessibility evidence matrix contains a failure.");
  }
  writeFileSync("evidence/ticket-03/dom-layout-accessibility.json", `${JSON.stringify({ browser: "chromium", axeCore: "4.13.0", entries }, null, 2)}\n`);
  process.stdout.write(`Captured ${entries.length} passing DOM, layout, and accessibility matrix entries.\n`);
} finally {
  await browser.close();
  server.stop();
}
