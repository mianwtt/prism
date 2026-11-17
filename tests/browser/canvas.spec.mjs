import { openEditor, openEvidence, openHistory, openCanvas } from "./ui.mjs";
import { test, expect } from "@playwright/test";

test("scenario canvas branches have separate positions and change the visual decision when selected", async ({ page, request }) => {
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/classic");
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await page.locator('.scenario-map-details > summary').click();
  await page.locator('.candidate-shelf > summary').click();
  await page.locator('.decision-reasoning > summary').click();
  await expect(page.locator("#scenario-viewport .canvas-product")).toHaveCount(3);
  await expect(page.locator("#evidence-pane")).toBeHidden();
  await expect(page.locator("#research-pane")).toBeHidden();
  await expect(page.locator("#scenario-products")).toHaveCount(0);
  const baseline = await page.locator(".baseline-node").boundingBox();
  const firstBranch = await page.locator(".branch-node").first().boundingBox();
  const outcome = await page.locator(".outcome-node").first().boundingBox();
  expect(firstBranch.x).toBeGreaterThan(baseline.x + baseline.width);
  expect(outcome.x).toBeGreaterThan(firstBranch.x + firstBranch.width);
  await page.locator('.branch-node[data-select-scenario="scenario-b"]').click();
  await expect(page.locator("#budget")).toHaveValue("8000");
  await expect(page.locator("#scenario-impact h3")).toHaveText("首选：Atlas 14 → Aero 13");
  await expect(page.locator("#scenario-impact")).toContainText("新进入可比较范围");
  await expect(page.locator(".canvas-product.product-winner h4")).toHaveText("Aero 13");
  await page.locator("#scenario-impact summary").click();
  expect(await page.locator(".scenario-bar").first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(0);
  await expect(page.locator("#source-matrix tbody tr")).toHaveCount(2);
  await openEvidence(page);
  await page.locator("#source-candidate").selectOption("aero");
  await expect(page.locator("#source-summary")).toContainText("Aero 13");
  await page.locator("#source-matrix details").first().getByText("原文依据").click();
  await expect(page.locator("#source-matrix blockquote").first()).toContainText("7299");
  await openCanvas(page);
  await page.screenshot({ path: "work/prism-scenario-canvas.png", fullPage: true });
  await page.locator(".scenario-workbench").screenshot({ path: "work/prism-whatif-workbench.png" });
  await openEditor(page);
  await page.locator("#budget").fill("9000");
  await page.locator("#budget").dispatchEvent("input");
  await page.locator('.branch-node[data-select-scenario="scenario-baseline"]').click();
  await expect(page.locator("#budget")).toHaveValue("7000");
  await openCanvas(page);
  await page.getByRole("button", { name: /保存新版本/ }).click();
  await expect(page.locator("#version-label")).toContainText("v2");
  const id = await page.evaluate(() => location.hash.slice(1));
  const saved = await (await request.get("/api/spaces/" + id)).json();
  expect(saved.scenarios.find(s => s.id === "scenario-b").settings.budget).toBe(9000);
  await page.reload();
  await page.locator(".scenario-map-details > summary").click();
  await page.locator('.branch-node[data-select-scenario="scenario-b"]').click();
  await expect(page.locator("#budget")).toHaveValue("9000");
  expect(errors).toEqual([]);
});

test("switching What-if updates the winning image card while retaining its cited source", async ({ page, request }) => {
  const space = await (await request.post("/api/spaces/demo")).json();
  for (const id of ["atlas", "aero"]) {
    const source = space.sources.find(s => s.id === "source-" + id);
    source.image = { url: "https://example.com/fixture-" + id + ".png" };
    space.candidates.find(c => c.id === id).media = { url: source.image.url, sourceId: source.id };
  }
  await page.route("https://example.com/fixture-*.png", route => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=", "base64"),
  }));
  await page.route("**/api/spaces/" + space.id, route => route.fulfill({ json: space }));
  await page.goto("/classic#" + space.id);
  await page.locator('.scenario-map-details > summary').click();
  await page.locator('.candidate-shelf > summary').click();
  await page.locator('.decision-reasoning > summary').click();
  await expect(page.locator(".product-winner img")).toHaveAttribute("src", /fixture-atlas/);
  await page.locator('.branch-node[data-select-scenario="scenario-b"]').click();
  await expect(page.locator(".product-winner img")).toHaveAttribute("src", /fixture-aero/);
  await expect(page.locator("#scenario-scene")).toContainText("具体配置待核实");
  const card=page.locator(".product-winner");
  const before=await card.boundingBox();
  await expect(page.locator(".scenario-switches .active")).toContainText("预算增加");
  await expect(card.locator(".product-change")).toHaveText("新进入");
  await page.getByRole("button",{name:"放大画布",exact:true}).click();
  const after=await card.boundingBox();
  expect(after.width).toBeCloseTo(before.width,0);
  expect((await card.locator(".product-image").boundingBox()).height).toBeGreaterThanOrEqual(180);
  await card.getByRole("button",{name:"参数与多源对照 ↗",exact:true}).click();
  await expect(page.locator("#evidence-pane")).toBeVisible();
  await expect(page.locator("#source-candidate")).toHaveValue("aero");
});

test("custom branches can be added, renamed and removed without changing the saved baseline", async ({ page }) => {
  await page.goto("/classic");
  await page.getByRole("button", { name: /打开笔记本决策演示/ }).click();
  await page.locator('.scenario-map-details > summary').click();
  await page.locator('.candidate-shelf > summary').click();
  await page.locator('.decision-reasoning > summary').click();
  await page.getByRole("button", { name: "＋ 重量限制 1.3 kg", exact: true }).click();
  await expect(page.locator(".branch-node")).toHaveCount(3);
  await expect(page.locator("#max-weight")).toHaveValue("1.3");
  await expect(page.locator(".baseline-node")).toContainText("重量 ≤2 kg");
  await openEditor(page);
  await page.locator("#scenario-name").fill("每天通勤");
  await expect(page.locator(".branch-node.selected")).toContainText("每天通勤");
  await openEditor(page);
  await page.getByRole("button", { name: "删除当前分支", exact: true }).click();
  await expect(page.locator(".branch-node")).toHaveCount(2);
  await expect(page.locator("#max-weight")).toHaveValue("2");
});

test("saved merchant images appear only for a matching model with supporting evidence",async({page,request})=>{
  const space=await(await request.post('/api/spaces/demo')).json();
  const hp=space.candidates.find(c=>c.id==='atlas');hp.name='惠普 星Book 16';
  const source=space.sources.find(s=>s.id==='source-atlas');
  source.title='惠普星Book 16 酷睿5 210H 16GB 512GB 参数';
  source.image={url:'https://example.com/saved-hp.png'};
  const other=space.sources.find(s=>s.id==='source-aero');
  other.title='惠普星Book 16 参数';other.image={url:'https://example.com/wrong-family.png'};
  await page.route('https://example.com/*.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=','base64')}));
  await page.route('**/api/spaces/'+space.id,route=>route.fulfill({json:space}));
  await page.goto('/classic#'+space.id);
  await page.locator('.scenario-map-details > summary').click();
  await page.locator('.candidate-shelf > summary').click();
  await page.locator('.decision-reasoning > summary').click();
  await expect(page.locator('[data-product-id="atlas"] img')).toHaveAttribute('src',source.image.url);
  await expect(page.locator('[data-product-id="aero"] img')).toHaveCount(0);
});

test("supplementing starts a new research job rather than rereading old URLs",async({page,request})=>{
  const space=await(await request.post("/api/spaces/demo")).json();space.mode="live";
  const id="22222222-3333-4444-8555-666666666666";
  let searches=0,complete=false;
  await page.route("**/api/spaces/"+space.id,route=>route.fulfill({json:space}));
  await page.route("**/api/spaces/"+space.id+"/research",route=>{searches++;return route.fulfill({status:202,json:{id,status:"running"}});});
  await page.route("**/api/jobs/"+id,route=>route.fulfill({json:{id,status:complete?"complete":"running",spaceId:space.id,events:[{message:"正在补充价格来源",type:"search"}]}}));
  await page.goto("/classic#"+space.id);
  await page.locator('.workspace-more > summary').click();
  await page.getByRole("button",{name:"补充检索",exact:true}).click();
  await expect(page.locator("#job-events")).toContainText("正在补充价格来源");
  expect(searches).toBe(1);complete=true;
  await expect(page.locator("#scenario-viewport")).toBeVisible();
  await expect(page.locator("#evidence-pane")).toBeHidden();
});

test('reference prices stay separate from current offers and require an explicit assumption for simulation',async({page,request})=>{
 const space=await(await request.post('/api/spaces/demo')).json();
 const c=space.candidates[0],s=space.sources.find(s=>s.id==='source-atlas');
 c.facts.price={value:null,status:'unknown',sourceId:null,quote:''};
 s.text+='\n平台参考报价为6399元';
 c.priceObservations=[{value:6399,kind:'aggregator-reference',sourceId:s.id,quote:'平台参考报价为6399元',configuration:'虚构测试配置',retrievedAt:new Date().toISOString()}];
 await page.route('**/api/spaces/'+space.id,route=>route.fulfill({json:space}));
 await page.goto('/classic#'+space.id);
  await page.locator('.scenario-map-details > summary').click();
  await page.locator('.candidate-shelf > summary').click();
  await page.locator('.decision-reasoning > summary').click();
 const price=page.locator('[data-product-id="atlas"] [data-fact="price"]');
 await expect(price).toContainText('¥6,399');await expect(price).toContainText('非当前成交价');
 await expect(page.locator('[data-product-id="atlas"]')).not.toHaveClass(/product-winner/);
 await price.click();
 await page.getByRole('button',{name:'填入此参考价（个人假设）'}).click();
 await expect(page.locator('#review-value')).toHaveValue('6399');
 expect(space.candidates[0].facts.price.value).toBeNull();
});
