import { test, expect } from "@playwright/test";
test("local search hides commercial key fields and submits an explicit backend choice", async ({
  page,
}) => {
  await page.goto("/classic");
  await page.getByRole("button", { name: "研究设置", exact: true }).click();
  await page.getByLabel("搜索服务", { exact: true }).selectOption("tofu");
  await expect(page.locator("#search-key-field")).toBeHidden();
  await page.getByLabel("模型名称").fill("local-model");
  await page.getByLabel("模型 API Key").fill("ollama");
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "POST") {
      const data = route.request().postDataJSON();
      expect(data.searchProvider).toBe("tofu");
      expect(data.searchKey).toBe("");
      return route.fulfill({ json: { ready: true, searchProvider: "tofu" } });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.locator("#live-status")).toContainText("已就绪");
});
test("unconfigured research opens setup and credentials are cleared after saving", async ({
  page,
}) => {
  await page.goto("/classic");
  await page.getByRole("button", { name: "开始研究" }).click();
  await expect(
    page.getByRole("dialog", { name: "连接你的研究服务" }),
  ).toBeVisible();
  await expect(page.getByLabel("模型 API Key")).toHaveValue("");
  await page.getByLabel("模型名称").fill("example-model");
  await page.getByLabel("模型 API Key").fill("fake-model-key");
  await page.getByLabel("Tavily API Key").fill("fake-search-key");
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        json: {
          baseUrl: "https://api.openai.com/v1",
          model: "example-model",
          hasModelKey: true,
          hasSearchKey: true,
          ready: true,
        },
      });
    return route.continue();
  });
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await expect(page.locator("#model-key")).toHaveValue("");
  await expect(page.locator("#search-key")).toHaveValue("");
  await expect(page.locator("#live-status")).toContainText("已就绪");
  const stored = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(stored)).not.toContain("fake-model-key");
});
test("setup offers a working no-key demo alternative", async ({ page }) => {
  await page.goto("/classic");
  await page.getByRole("button", { name: "研究设置", exact: true }).click();
  await page.getByRole("button", { name: /暂不配置，体验演示/ }).click();
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await expect(page.locator("#recommendation h3")).toContainText("Atlas 14");
});
