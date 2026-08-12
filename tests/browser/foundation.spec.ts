import { expect, test } from "@playwright/test";

test("the pinned Next.js foundation starts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Michael Vasandani" })).toBeVisible();
});
