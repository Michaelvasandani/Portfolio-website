import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { fixtureNames } from "../../src/renderer/fixtures";

const sectionOrder = ["About", "Experience", "Projects", "Résumé", "Links"];
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const axeSource = readFileSync(
  "node_modules/axe-core/axe.min.js",
  "utf8",
);

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    clipped: [...document.querySelectorAll("main *")].filter((element) => {
      const style = getComputedStyle(element);
      return !element.classList.contains("visually-hidden") && style.overflow === "hidden" && element.scrollHeight > element.clientHeight;
    }).map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 80) })),
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  expect(overflow.clipped).toEqual([]);
}

async function expectNoAxeViolations(page: Page) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe;
    return (await axe.run()).violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }));
  });
  expect(violations).toEqual([]);
}

test("Portfolio renders the Engraved Folio journey and public provenance", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Michael Sagar Vasandani" })).toBeVisible();
  await expect(page.locator("main > section > header > h2").allTextContents()).resolves.toEqual(sectionOrder);
  await expect(page.getByRole("link", { name: "Email Michael" })).toHaveCount(2);
  await expect(page.getByText(/Last updated/)).toBeVisible();
  await expect(page.getByText(/^sha256:[a-f0-9]{64}$/)).toBeVisible();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expectNoAxeViolations(page);
});

test("Public résumé HTML is complete, semantic, and links to the PDF", async ({ page }) => {
  await page.goto("/resume");

  await expect(page.getByRole("heading", { level: 1, name: "Michael Sagar Vasandani — Résumé" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 }).allTextContents()).resolves.toEqual([
    "Experience",
    "Education",
    "Projects",
    "Technical Skills",
  ]);
  await expect(page.getByText("Cut bug-fix turnaround by 60%", { exact: false })).toBeVisible();
  const pdf = page.getByRole("link", { name: "Download résumé as tagged PDF" });
  await expect(pdf).toHaveAttribute("href", "/michael-vasandani-resume.pdf");
  await expectNoAxeViolations(page);
});

for (const width of [320, 390]) {
  test(`the public identity wraps only between words at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    const wordLineCounts = await page.locator(".identity h1").evaluate((heading) => {
      const text = heading.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error("Identity heading requires a text node.");
      return [...(text.textContent?.matchAll(/\S+/g) ?? [])].map((match) => {
        const range = document.createRange();
        range.setStart(text, match.index ?? 0);
        range.setEnd(text, (match.index ?? 0) + match[0].length);
        const lines = new Set([...range.getClientRects()].map(({ top }) => Math.round(top)));
        return { word: match[0], lines: lines.size };
      });
    });

    expect(wordLineCounts).toEqual([
      { word: "Michael", lines: 1 },
      { word: "Sagar", lines: 1 },
      { word: "Vasandani", lines: 1 },
    ]);
    await expectNoPageOverflow(page);
  });
}

for (const viewport of viewports) {
  test(`sparse and dense fixtures reflow at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const fixture of ["sparse", "dense"]) {
      await page.goto(`/renderer-fixtures/${fixture}`);
      await expectNoPageOverflow(page);
      await expectNoAxeViolations(page);
      await expect(page.locator("main > section > header > h2").allTextContents()).resolves.toEqual(sectionOrder);
    }
    await page.goto("/");
    await expectNoPageOverflow(page);
    await expectNoAxeViolations(page);
    await page.goto("/resume");
    await expectNoPageOverflow(page);
    await expectNoAxeViolations(page);
  });
}

test("all baseline fixture routes render their distinctive content", async ({ page }) => {
  for (const fixture of fixtureNames) {
    const response = await page.goto(`/renderer-fixtures/${fixture}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-renderer-fixture]")).toHaveAttribute("data-renderer-fixture", fixture);
  }
});

test("320px long words, 200% zoom, and WCAG text spacing do not hide content", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 1136 });
  await page.goto("/renderer-fixtures/long-word");
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = "html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }";
    document.head.append(style);
  });
  await expectNoPageOverflow(page);
  expect(await page.evaluate(() => document.documentElement.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize) * 16)).toBe(320);
  await expect(page.getByText("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeVisible();
});

test("forced colors, reduced motion, and keyboard focus preserve the journey", async ({ page, browserName }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/renderer-fixtures/dense");

  const skipLink = page.getByRole("link", { name: "Skip to portfolio content" });
  if (browserName === "webkit") {
    await skipLink.focus();
  } else {
    await page.keyboard.press("Tab");
  }
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS("outline-style", "solid");
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  await expectNoPageOverflow(page);
});

test("discrete navigation and action links expose 44px targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const sizes = await page.locator(".discrete-link").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
});

test("robots, sitemap, social image, and the tagged PDF are directly available", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Allow: /");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/resume");

  const socialImage = await request.get("/opengraph-image");
  expect(socialImage.status()).toBe(200);
  expect(socialImage.headers()["content-type"]).toBe("image/png");

  const pdf = await request.get("/michael-vasandani-resume.pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});
