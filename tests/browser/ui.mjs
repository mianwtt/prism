export async function openEditor(page) {
  if(await page.locator("#scenario-inspector").isHidden())await page.locator("#toggle-scenario-editor").click();
}
export async function openEvidence(page) { await page.getByRole("button",{name:"来源与参数",exact:true}).click(); }
export async function openHistory(page) { await page.getByRole("button",{name:"研究记录与版本",exact:true}).click(); }
export async function openCanvas(page) { await page.getByRole("button",{name:"情景推演",exact:true}).click(); }
