import { test, expect } from "@playwright/test";

/** UI test: user taste → validated plan → AI décor styled directly into the 3D result.
 *
 *  Prereq: start the dev server from repo root:
 *    npm run dev
 *    (Vite serves the app on :5173 with /api/nim proxy)
 *
 *  Run:
 *    npx playwright test
 *
 *  What it tests: a real user sets and confirms a room, types a taste, generates a
 *  validated plan, and the result page renders the 3D canvas immediately with an
 *  "AI is working" cue that resolves to a styled chip (AI or offline fallback).
 *  No page offers a separate AI draft.
 */

async function reachResult(page: import("@playwright/test").Page, taste: string): Promise<void> {
  await page.goto("http://localhost:5173");
  await page.waitForSelector("[data-room-field='widthMm']");
  await page.fill("[data-room-field='widthMm']", "3000");
  await page.fill("[data-room-field='depthMm']", "3000");
  await page.click("[data-action='preview-room']");
  await page.click(".confirmation-bar [data-action='confirm-room']");
  await page.waitForSelector("[data-taste-text]", { timeout: 5000 });
  await expect(page.locator("[data-action='generate-concept']")).toHaveCount(0);
  await page.fill("[data-taste-text]", taste);
  await page.click("[data-action='generate']");
  await page.waitForSelector("[data-render-canvas='3d']", { timeout: 10000 });
}

test("taste styles décor directly into the 3D result with a working cue", async ({ page }) => {
  await reachResult(page, "calm warm spa with plants, candles and a brass pendant");
  // The cue (or, if the answer was instant/cached, the chip) appears over the canvas.
  await expect(page.locator(".render-canvas-wrap .ai-pill, .render-canvas-wrap .ai-chip").first()).toBeVisible({ timeout: 5000 });
  // The request resolves (AI or offline fallback) within the 12 s client timeout.
  await expect(page.locator(".render-canvas-wrap .ai-chip")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".render-decor-note")).toContainText("not KOHLER products");
  await page.waitForTimeout(1500); // let the décor stage-in finish
  await page.screenshot({ path: "ui-test-decor.png" });
});

test("3D result with décor renders with visible brightness and contrast", async ({ page }) => {
  await reachResult(page, "bright modern bathroom with mirror and plants");
  await expect(page.locator(".render-canvas-wrap .ai-chip")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-render-canvas='3d']");
    if (!canvas) return { brightness: 0, variance: 0 };
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext("2d");
    if (!ctx) return { brightness: 0, variance: 0 };
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const values: number[] = [];
    for (let i = 0; i < data.length; i += 16) values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return { brightness: avg, variance: values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length };
  });
  expect(stats.brightness).toBeGreaterThan(50);
  expect(stats.variance).toBeGreaterThan(100);
});
