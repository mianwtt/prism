import { openEditor, openEvidence, openHistory, openCanvas } from "./ui.mjs";
import { test, expect } from "@playwright/test";
test("first-time user can inspect, recalculate, save, restore and reopen", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/classic");
  await expect(page.getByRole("heading", { name: /研究一个问题/ })).toBeVisible();
  await page.screenshot({
    path: "work/prism-desktop-home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await expect(page.locator("#mode-notice")).toContainText("虚构商品");
  await expect(page.locator("#recommendation h3")).toContainText("Atlas 14");
  await page.locator('.choice-destination [data-fact="price"]').click();
  await expect(page.locator("#evidence-dialog")).toBeVisible();
  await expect(page.locator("#evidence-body blockquote")).toContainText("6499");
  await page.getByRole("button", { name: "关闭证据窗口" }).click();
  await openEditor(page);
  await page.locator("#budget").fill("7299");
  await page.locator("#budget").dispatchEvent("input");
  await expect(page.locator("#recommendation h3")).toContainText("Aero 13");
  await expect(page.locator("#recommendation")).toContainText(
    "新进入范围：Aero 13",
  );
  await openCanvas(page);
  await page.getByRole("button", { name: /保存新版本/ }).click();
  await expect(page.locator("#version-label")).toContainText("v2");
  const savedUrl = page.url();
  await openHistory(page);
  await page.locator("#history").getByRole("button", { name: /v1/ }).click();
  await expect(page.locator("#recommendation h3")).toContainText("Atlas 14");
  await page.goto(savedUrl);
  await expect(page.locator("#recommendation h3")).toContainText("Aero 13");
  await expect(page.locator("#toast")).not.toBeVisible({ timeout: 8000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "work/prism-workspace.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("fact edits are saved as personal assumptions with original evidence preserved", async ({
  page,
}) => {
  await page.goto("/classic");
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await page.locator('.choice-destination [data-fact="price"]').click();
  await page.locator("#review-value").fill("6200");
  await page.getByRole("button", { name: "确认参数并保存版本" }).click();
  await expect(page.locator("#evidence-dialog")).not.toBeVisible();
  await expect(page.locator("#version-label")).toContainText("v2");
  await expect(
    page.locator('.choice-destination [data-fact="price"]'),
  ).toContainText("个人假设");
  await page.locator('.choice-destination [data-fact="price"]').click();
  await page.getByText("查看覆盖前的来源").click();
  await expect(page.locator("#evidence-body")).toContainText("原始值：6499");
});
test("mobile layout stays within viewport and demo works without provider credentials", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/classic");
  await expect(page.locator("#live-status")).toContainText("连接研究服务");
  await page.screenshot({ path: "work/prism-mobile-home.png", fullPage: true });
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await expect(page.locator("#recommendation h3")).toContainText("Atlas 14");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.locator('.canvas-question h3')).toBeVisible();
  await page.screenshot({
    path: "work/prism-mobile-workspace.png",
    fullPage: true,
  });
});
