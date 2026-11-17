import { openEditor, openEvidence, openHistory, openCanvas } from "./ui.mjs";
import { test, expect } from "@playwright/test";
test("a still-running legacy service shows restart guidance while preserving the demo", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ok: true, version: "0.1.0", live: false } }),
  );
  await page.goto("/classic");
  await expect(page.locator("#server-notice")).toContainText("旧版本后台");
  await expect(
    page.getByRole("button", { name: "研究任务", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await expect(page.locator("#recommendation h3")).toContainText("Atlas 14");
  await page.locator(".workspace-more > summary").click();
  await expect(
    page.getByRole("button", { name: "编辑候选方案", exact: true }),
  ).toBeDisabled();
});
test("manual source correction binds an exact quote rather than silently becoming an assumption", async ({
  page,
  request,
}) => {
  await page.goto("/classic");
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await page.locator('.candidate-shelf > summary').click();
  await page.getByRole("button", { name: "查看 Atlas 14 的内存证据" }).click();
  await page.getByLabel("关联新的原文引文（可选）").fill("内存 32 GB。");
  await page.getByRole("button", { name: "确认参数并保存版本" }).click();
  await expect(page.locator("#evidence-dialog")).not.toBeVisible();
  const id = await page.evaluate(() => location.hash.slice(1));
  const saved = await (await request.get("/api/spaces/" + id)).json();
  expect(saved.candidates[0].facts.memory.quote).toBe("内存 32 GB。");
  expect(saved.candidates[0].facts.memory.confirmation).toBe("user-reviewed");
});
test("candidate editing creates a reviewable version and can restore the original options", async ({
  page,
}) => {
  await page.goto("/classic");
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await page.locator(".workspace-more > summary").click();
  await page.getByRole("button", { name: "编辑候选方案", exact: true }).click();
  const atlas = page.locator(".candidate-edit-row").first();
  await atlas.locator(".candidate-name").fill("我的开发本");
  await atlas.getByRole("checkbox", { name: "参与比较" }).uncheck();
  await page.getByLabel("添加候选方案").fill("备用 D");
  await page.getByRole("button", { name: "保存方案", exact: true }).click();
  await expect(page.locator("#candidates-dialog")).not.toBeVisible();
  await expect(page.locator("#candidate-table")).toContainText("备用 D");
  await expect(page.locator("#candidate-table")).toContainText("已暂停");
  await expect(page.locator("#version-diff")).toContainText("新增方案：备用 D");
  await expect(page.locator("#recommendation h3")).toContainText("Forge 15");
  await openHistory(page);
  await page.locator("#history").getByRole("button", { name: /v1/ }).click();
  await expect(page.locator("#candidate-table")).not.toContainText("备用 D");
  await expect(page.locator("#recommendation h3")).toContainText("Atlas 14");
});
test("failed research keeps its trace across page reload and offers explicit resume", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/spaces/demo");
  const space = await response.json();
  const id = "11111111-2222-4333-8444-555555555555";
  let resumed = false;
  await page.route("**/api/settings", (route) =>
    route.fulfill({ json: { ready: true, searchProvider: "tofu" } }),
  );
  await page.route("**/api/research", (route) =>
    route.fulfill({ status: 202, json: { id } }),
  );
  await page.route("**/api/jobs/" + id + "**", (route) => {
    if (route.request().method() === "POST") {
      resumed = true;
      return route.fulfill({ status: 202, json: { id, status: "running" } });
    }
    return route.fulfill({
      json: {
        id,
        status: resumed ? "complete" : "failed",
        error: "临时搜索故障",
        spaceId: space.id,
        events: [{ type: "search", message: "已保存的搜索记录" }],
      },
    });
  });
  await page.goto("/classic");
  await page.getByRole("button", { name: "开始研究" }).click();
  await expect(page.locator("#job-error")).toContainText("临时搜索故障");
  await expect(page.locator("#job-events")).toContainText("已保存的搜索记录");
  await page.reload();
  await expect(page.locator("#resume-job")).toBeVisible();
  await page.getByRole("button", { name: "从检查点继续" }).click();
  await expect(page.locator("#recommendation h3")).toContainText("Atlas 14");
  expect(resumed).toBe(true);
});
