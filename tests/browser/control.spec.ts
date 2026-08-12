import { expect, test } from "@playwright/test";

test("owner access is non-indexed and exposes no server credential", async ({ page }) => {
  const response = await page.goto("/owner-access");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Owner access" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute(
    "href",
    "/api/auth/github/start",
  );
  const content = await page.content();
  expect(content).not.toMatch(/test-github-client-secret|test-owner-session-secret|31415926/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("unauthenticated control routes disclose neither shell content nor diagnostics", async ({ request }) => {
  const pageResponse = await request.get("/control", { maxRedirects: 0 });
  expect(pageResponse.status()).toBe(404);
  const pageBody = await pageResponse.text();
  expect(pageBody).not.toMatch(/Publication runs|Circuit breaker|Raw deletion|Managed control-plane/i);
  expect(pageResponse.headers()["cache-control"]).toContain("no-store");
  expect(pageResponse.headers()["x-robots-tag"]).toContain("noindex");

  const apiResponse = await request.get("/api/control/status/deployments", { maxRedirects: 0 });
  expect(apiResponse.status()).toBe(404);
  expect(await apiResponse.text()).toBe("Not found");
  expect(apiResponse.headers()["cache-control"]).toContain("no-store");
});

test("OAuth start sets a short-lived secure HTTP-only state cookie", async ({ request }) => {
  const response = await request.get("/api/auth/github/start", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize/);
  expect(response.headers()["set-cookie"]).toContain("__Host-portfolio-oauth=");
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
  expect(response.headers()["set-cookie"]).toContain("Secure");
  expect(response.headers()["set-cookie"]).toContain("Max-Age=300");
});
