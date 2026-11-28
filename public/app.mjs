import {mountUniversal} from '/universal-view.mjs';
import {setupTaskStart,taskQuestion,clearTaskStart} from '/task-start.mjs';
import {clearWorkspaceDrafts} from '/workspace-draft.mjs';
import {adaptLegacyDecision} from '/legacy-decision.mjs';
const classicView=location.pathname.startsWith('/classic');
document.body.classList.toggle('adaptive-studio',!classicView);
setupTaskStart();
if(classicView)document.getElementById('question').value='帮我选一台 7000 元以内适合 Java 开发的笔记本，至少 16GB 内存，重点关注便携性。';
import {
  dimensions,
  evaluate,
  budgetTransitions,
  comparison,
  validateSettings,
  factIssue,
} from "/engine.mjs";
import { canvasView, impactView, sourceView, productView,decisionSummaryView,specificationComparisonView,explorationView } from "/decision-view.mjs";
import { validateScenarios,scenarioCandidates } from "/scenarios.mjs";
const $ = (id) => document.getElementById(id);
const jobActivity=document.createElement('div');jobActivity.className='job-activity';
jobActivity.innerHTML='<span class="agent-orb" aria-hidden="true">✦</span><p role="status">我先看看有哪些选择。</p>';
$('job-events').before(jobActivity);
const executionDetails=document.createElement('details');executionDetails.className='job-execution-details';
executionDetails.innerHTML='<summary>查看执行过程</summary>';
jobActivity.after(executionDetails);executionDetails.append($('job-events'));
$("scenario-inspector").append(document.querySelector(".controls"));
$("scenario-inspector").hidden=true;
document.querySelector(".canvas-toolbar > div:last-child").append($("toggle-scenario-editor"));
const mapTools=document.createElement('div');mapTools.className='map-tools';
for(const id of ['canvas-zoom-out','canvas-zoom-label','canvas-zoom-in','canvas-fit'])mapTools.append($(id));
document.querySelector('.canvas-toolbar').append(mapTools);
const scenarioComposer=document.createElement('form');scenarioComposer.className='scenario-composer';
scenarioComposer.innerHTML='<label for="scenario-request">如果换个条件呢？</label><div><input id="scenario-request" maxlength="40" placeholder="预算增加 1000 元？或者，内存至少 32GB？" aria-label="输入 What-if 条件" autocomplete="off"><button type="submit">试试看 ↗</button></div>';
document.querySelector('.canvas-toolbar').before(scenarioComposer);
const explorationPanel=document.createElement('div');explorationPanel.id='exploration-panel';
document.querySelector('.scenario-main').prepend(scenarioComposer,explorationPanel);
scenarioComposer.onsubmit=e=>{
  e.preventDefault();if(busy)return;
  const text=$('scenario-request').value.trim();
  if(!text)return;
  if(scenarios.length>=24)return toast('最多保存 24 条情景，当前情况会始终保留。');
  const next=structuredClone(settings);
  const budget=/预算\s*(?:(增加|减少)\s*)?(\d+(?:\.\d+)?)\s*元?/.exec(text),memory=/(\d+(?:\.\d+)?)\s*[gG](?:[bB])?/i.exec(text),weight=/(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/i.exec(text);
  if(!budget&&!memory&&!weight)return toast('请写明预算金额、内存 GB 或重量 kg，或使用条件编辑。');
  if(budget)next.budget=budget[1]?next.budget+(budget[1]==='增加'?1:-1)*Number(budget[2]):Number(budget[2]);
  if(memory)next.minMemory=Number(memory[1]);if(weight)next.maxWeight=Number(weight[1]);
  try{validateSettings(next);}catch(error){return toast(error.message);}
  const branch={id:'scenario-'+crypto.randomUUID(),name:text,settings:next,parentScenarioId:selectedScenarioId,candidateIds:scenarioCandidates(space,scenarios.find(s=>s.id===selectedScenarioId)).map(c=>c.id)};
  scenarios.push(branch);selectedScenarioId=branch.id;settings=next;$('scenario-request').value='';
  controls();setDirty(true);render();if(space.mode!=='demo')exploreScenario();
};
document.querySelector(".workspace-menu").append($("manage-candidates"));
document.querySelector('.workspace-menu').append($('supplement-button'));
document.querySelector(".scenario-main").append($("budget-exploration"));
const reasoning=document.createElement('details');reasoning.className='decision-reasoning';
reasoning.innerHTML='<summary>为什么这样选？</summary>';
reasoning.append($('decision-insight'),$('scenario-impact'),$('budget-exploration'));
document.querySelector('.scenario-main').append(reasoning);
document.querySelector('.canvas-toolbar').classList.add('whatif-shortcuts');
scenarioComposer.after(document.querySelector('.canvas-toolbar'));
$('evidence-pane').prepend($('research-overview'));
const comparisonPanel=document.createElement('div');comparisonPanel.id='specification-comparison';
const specificationDetails=document.createElement('details');specificationDetails.className='specification-details';
specificationDetails.innerHTML='<summary>展开完整参数对比</summary>';specificationDetails.append(comparisonPanel);
document.querySelector('.source-comparison').before(specificationDetails);
const researchPane=document.createElement("section");
researchPane.id="research-pane";researchPane.hidden=true;
researchPane.append(document.querySelector(".lower-grid"),$("diff-panel"));
$("workspace").append(researchPane);
const recordForm=document.createElement('form');recordForm.className='decision-record-form';
recordForm.innerHTML='<div class="record-heading"><div><span class="eyebrow">YOUR DECISION</span><h2>留下选择，也留下理由。</h2><p>以后条件变了，还能记得今天为什么这样想。</p></div><span id="decision-record-status">尚未记录</span></div><label for="decision-candidate">这次的倾向</label><select id="decision-candidate"></select><label for="decision-rationale">你的判断</label><textarea id="decision-rationale" maxlength="1500" rows="4" placeholder="什么促成了这个选择？还有哪些问题，值得以后回来再看？"></textarea><div class="record-actions"><small>和当前条件、来源一起保存为一个版本。</small><button type="submit" id="save-decision" class="primary">记录这次判断 ↗</button></div>';
researchPane.prepend(recordForm);
const traceDetails=document.createElement('details');traceDetails.className='research-audit';traceDetails.innerHTML='<summary>查看 Agent 研究轨迹</summary>';
$('trace').before(traceDetails);traceDetails.append($('trace'));
$('diff-panel').open=false;
recordForm.onsubmit=async event=>{
  event.preventDefault();const button=$('save-decision');button.disabled=true;
  try{await save([],[],{candidateId:$('decision-candidate').value||null,rationale:$('decision-rationale').value});setWorkspacePane('history');}
  catch(error){toast(error.message);}finally{button.disabled=false;}
};
document.addEventListener('click',e=>{
  if(e.target.closest('[data-home-demo]')){$('demo-button').click();return;}
  const example=e.target.closest('[data-example-question]');
  if(example){$('question').value=example.dataset.exampleQuestion;$('question').dispatchEvent(new Event('input'));$('question').focus();}
});
function setWorkspacePane(pane) {
  $('workspace').dataset.pane=pane;
  document.querySelector(".scenario-workbench").hidden=pane!=="canvas";
  $("evidence-pane").hidden=pane!=="evidence";
  $("research-pane").hidden=pane!=="history";
  for(const button of document.querySelectorAll("[data-workspace-pane]")) {
    button.classList.toggle("active",button.dataset.workspacePane===pane);
    button.setAttribute("aria-current",button.dataset.workspacePane===pane?"page":"false");
  }
}
document.querySelector(".workspace-tabs").onclick=e=>{const button=e.target.closest("[data-workspace-pane]");if(button)setWorkspacePane(button.dataset.workspacePane);};
$("toggle-scenario-editor").onclick=()=>{
  const open=$("scenario-inspector").hidden;
  $("scenario-inspector").hidden=!open;
  document.querySelector(".scenario-layout").classList.toggle("editor-open",open);
  $("toggle-scenario-editor").setAttribute("aria-expanded",String(open));
  $("toggle-scenario-editor").textContent=open?"收起条件编辑":"编辑当前情景条件";
};
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) => "¥" + Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
let space = null,
  settings = null,
  dirty = false,
  busy = false,
  toastTimer,
  activeJobId = null,
  watchGeneration = 0,
  modernBackend = false;
let scenarios = [], selectedScenarioId = null, sourceCandidateId = null, canvasScale = 1, supplementBackend=false, scenarioBackend=false, explorationJob=null;
const scenarioFocus=new Map();
const conditionOrigins=new Map();
const scenarioPayload=items=>items.map(({id,name,settings,parentScenarioId})=>({id,name,settings,...(parentScenarioId?{parentScenarioId}:{})}));
const universalRoot=document.createElement('section');universalRoot.className='universal-root';$('workspace').append(universalRoot);
function ensureEditableScenario(){
  if(selectedScenarioId!=='scenario-baseline')return;
  if(scenarios.length>=24)throw new Error('最多保存 24 条情景，当前情况会始终保留。');
  const original=scenarios.find(s=>s.id==='scenario-baseline');
  const branch={id:'scenario-'+crypto.randomUUID(),name:'如果换成这组条件？',settings:structuredClone(settings),parentScenarioId:original.id,candidateIds:scenarioCandidates(space,original).map(c=>c.id)};
  scenarios.push(branch);selectedScenarioId=branch.id;
}
function initialScenarios(data) {
  const baseline={id:'scenario-baseline',name:'当前情况',settings:structuredClone(data.baselineSettings||data.settings),candidateIds:[...(data.baselineCandidateIds||data.candidates.map(c=>c.id))]};
  if(data.scenarios?.length){try{return [baseline,...validateScenarios(data.scenarios).filter(s=>s.id!=='scenario-baseline')];}catch{}}
  return [baseline,{id:'scenario-b',name:'如果预算增加 1000 元',settings:{...structuredClone(data.settings),budget:Math.min(1000000,data.settings.budget+1000)},candidateIds:data.candidates.map(c=>c.id)}];
}

function updateConnection(config) {
  $("live-status").textContent = config.ready
    ? `研究助手已就绪`
    : "连接研究服务 →";
}
function updateSearchFields() {
  const tofu = $("search-provider").value === "tofu";
  const searxng=$("search-provider").value==='searxng';
  $("search-key-field").hidden = tofu||searxng;
  $("search-key").required = !tofu&&!searxng && $("search-key").dataset.saved !== "true";
  $("searxng-field").hidden=!searxng;$("searxng-url").required=searxng;
  $("search-provider-help").textContent = tofu
    ? "无需搜索密钥。首次安装请运行 npm run setup:search；结果可能受网络和搜索引擎限流影响。"
    : searxng?'使用已有 SearXNG 实例；需要在实例配置中启用 JSON 格式。无需安装 tofu 或填写 Tavily 密钥。':"使用 Tavily 的搜索接口，需要有效 API Key。";
}
$("search-provider").onchange = updateSearchFields;
async function openSettings() {
  try {
    const config = await api("/api/settings");
    $("model-url").value = config.baseUrl;
    $("model-name").value = config.model;
    $("search-provider").value = config.searchProvider || "tavily";
    $("searxng-url").value=config.searxngUrl||'';
    for (const [id, stored] of [
      ["model-key", config.hasModelKey],
      ["search-key", config.hasSearchKey],
    ]) {
      $(id).value = "";
      $(id).required = !stored;
      $(id).dataset.saved = String(stored);
      $(id).placeholder = stored ? "留空保留已保存的密钥" : "请输入密钥";
      $(id + "-status").textContent = stored ? " · 已保存" : "";
    }
    updateSearchFields();
    $("settings-error").hidden = true;
    $("settings-dialog").showModal();
  } catch (error) {
    toast(error.message);
  }
}
$("settings-button").onclick = openSettings;
$("live-status").onclick = openSettings;
$("close-settings").onclick = () => $("settings-dialog").close();
$("settings-dialog").addEventListener("close", () => {
  $("model-key").value = "";
  $("search-key").value = "";
});
$("settings-demo").onclick = () => {
  $("settings-dialog").close();
  $("demo-button").click();
};
$("settings-form").onsubmit = async (e) => {
  e.preventDefault();
  $("save-settings").disabled = true;
  $("settings-error").hidden = true;
  try {
    const config = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        baseUrl: $("model-url").value,
        model: $("model-name").value,
        modelKey: $("model-key").value,
        searchKey: $("search-key").value,
        searchProvider: $("search-provider").value,
        searxngUrl:$("searxng-url").value,
      }),
    });
    updateConnection(config);
    $("settings-dialog").close();
    toast("配置已保存并生效。服务连通性将在开始研究时验证。");
  } catch (error) {
    $("settings-error").textContent = error.message;
    $("settings-error").hidden = false;
  } finally {
    $("save-settings").disabled = false;
  }
};
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5500);
}
async function api(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
function show(view) {
  for (const id of ["welcome", "workspace", "job-panel"])
    $(id).hidden = id !== view;
}
function setDirty(value) {
  dirty = value;
  $("save-button").textContent = value ? "保存修改" : "保存";
  $("save-button").setAttribute('aria-label','保存新版本');
}
async function refreshSidebar() {
  const all = await api("/api/spaces"),
    roots = new Set();
  const latest = all.filter((s) => {
    if (roots.has(s.rootId)) return false;
    roots.add(s.rootId);
    return true;
  });
  $("spaces").innerHTML = latest.length
    ? latest
        .map(
          (s) =>
            `<div class="space-row"><button class="space-link ${space?.rootId === s.rootId ? "active" : ""}" data-space="${s.id}"><span>◇</span><span>${escape(s.title)}<small>${s.mode === "demo" ? "演示" : "联网研究"} · v${s.version}</small></span></button><button type="button" class="space-delete" data-delete-space="${s.id}" data-delete-title="${escape(s.title)}" aria-label="删除决策空间：${escape(s.title)}" title="删除决策空间"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg></button></div>`,
        )
        .join("")
    : '<p class="empty-nav">你的第一个决策空间<br>会保存在这里。</p>';
  $('home-recent').innerHTML=latest.length?latest.slice(0,3).map(s=>`<button type="button" data-space="${s.id}" class="recent-space"><span class="recent-mark">◇</span><strong>${escape(s.title)}</strong><small>${s.mode==='demo'?'演示空间':'已保存的研究'} · ${escape(new Date(s.savedAt).toLocaleDateString('zh-CN',{month:'short',day:'numeric',timeZone:'Asia/Shanghai'}))}</small><span>↗</span></button>`).join(''):'<p class="recent-empty">你的第一个问题，会成为这里的第一个决策空间。</p>';
}
const deleteDialog=document.createElement('dialog');
deleteDialog.className='space-delete-dialog';
deleteDialog.setAttribute('aria-labelledby','delete-space-heading');
deleteDialog.innerHTML='<form><h2 id="delete-space-heading">删除这个决策空间？</h2><p class="delete-space-name"></p><p>将从本机删除这个空间的全部历史版本、对话、保存的来源资料和关联研究记录。此操作无法撤销。</p><p class="delete-space-error" role="alert" hidden></p><footer><button type="button" data-delete-cancel>取消</button><button type="submit" class="delete-confirm">删除空间</button></footer></form>';
document.body.append(deleteDialog);
let pendingDeletion=null,deletingSpace=false;
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-delete-space]');if(!button)return;
  button.closest('.space-menu')?.removeAttribute('open');
  pendingDeletion=button.dataset.deleteSpace;deleteDialog.querySelector('.delete-space-name').textContent=button.dataset.deleteTitle;
  deleteDialog.querySelector('.delete-space-error').hidden=true;
  deleteDialog.showModal();deleteDialog.querySelector('[data-delete-cancel]').focus();
});
deleteDialog.querySelector('[data-delete-cancel]').onclick=()=>{if(!deletingSpace)deleteDialog.close();};
deleteDialog.addEventListener('cancel',e=>{if(deletingSpace)e.preventDefault();});
deleteDialog.querySelector('form').onsubmit=async e=>{
  e.preventDefault();if(deletingSpace||!pendingDeletion)return;
  deletingSpace=true;const confirm=deleteDialog.querySelector('.delete-confirm'),cancel=deleteDialog.querySelector('[data-delete-cancel]'),error=deleteDialog.querySelector('.delete-space-error');
  confirm.disabled=cancel.disabled=true;confirm.textContent='正在删除…';error.hidden=true;
  try{
    const deleted=await api('/api/spaces/'+pendingDeletion,{method:'DELETE'});
    clearWorkspaceDrafts(deleted.deletedRootId);
    if(space?.rootId===deleted.deletedRootId){
      universalRoot.__disconnectBranches?.();universalRoot.__disconnectBranches=null;universalRoot.__flowParents=null;
      for(const handler of ['onclick','oninput','onchange','onsubmit','onpointerdown','onfocusin','onkeydown'])universalRoot[handler]=null;
      universalRoot.innerHTML='';space=null;scenarios=[];settings=null;setDirty(false);
      show('welcome');document.documentElement.classList.remove('option-dialog-open');$('breadcrumb').textContent='开始探索';
      history.replaceState(null,'',location.pathname+location.search);
    }
    deleteDialog.close();await refreshSidebar();toast('决策空间及其本地记录已删除。');
  }catch(problem){error.textContent=problem.message;error.hidden=false;}
  finally{deletingSpace=false;confirm.disabled=cancel.disabled=false;confirm.textContent='删除空间';}
};
async function load(data) {
  if(!classicView)data=adaptLegacyDecision(data);
  space = data;
  $('workspace').classList.toggle('is-universal',!!data.schema);
  universalRoot.hidden=!data.schema;
  if(data.schema){
    dirty=false;show('workspace');history.replaceState(null,'','#'+data.id);$('breadcrumb').textContent=data.schema.label;
    mountUniversal(universalRoot,data,{api,onLoad:load,onResearch:watchJob,toast,onBackgroundResult:refreshSidebar});await refreshSidebar();return;
  }
  conditionOrigins.clear();
  $('workspace').dataset.mode=data.mode;
  settings = structuredClone(data.settings);
  scenarios = initialScenarios(data);
  selectedScenarioId = scenarios.some(s=>s.id===data.activeScenarioId)?data.activeScenarioId:scenarios[0].id;
  settings=structuredClone(scenarios.find(s=>s.id===selectedScenarioId).settings);
  sourceCandidateId = data.candidates[0]?.id;
  $("workspace").classList.toggle('has-complete-products',data.candidates.length>0&&data.candidates.every(c=>c.productData?.status==='comparison-ready'));
  $("workspace").classList.toggle('is-research-draft',!!data.comparisonData&&!data.comparisonData.comparisonReady?.length);
  setDirty(false);
  show("workspace");
  setWorkspacePane("canvas");
  history.replaceState(null, "", "#" + data.id);
  $("breadcrumb").textContent = "决策空间";
  $("space-title").textContent = data.title;
  $("space-question").textContent = data.question;
  $('space-question').title=data.question;
  $('decision-candidate').innerHTML='<option value="">还在考虑</option>'+data.candidates.map(c=>`<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
  $('decision-candidate').value=data.decision?.candidateId||'';
  $('decision-rationale').value=data.decision?.rationale||'';
  $('decision-record-status').textContent=data.decision?`已记录 · ${new Date(data.decision.recordedAt).toLocaleDateString('zh-CN',{month:'long',day:'numeric',timeZone:'Asia/Shanghai'})}`:'尚未记录';
  $("mode-notice").textContent =
    data.mode === "demo"
      ? "演示 · 虚构商品 · 未调用联网研究"
      : "公开网页资料 · 保留来源报价";
  $("version-label").textContent =
    "v" + data.version + " · " + new Date(data.savedAt).toLocaleString("zh-CN");
  $("refresh-button").disabled = data.mode === "demo" || !modernBackend;
  $("candidate-count").textContent = String(data.candidates.length).padStart(
    2,
    "0",
  );
  $("trace").innerHTML =
    data.trace
      .map(
        (t) =>
          `<div class="trace-item"><span>↗</span><p>${escape(t.message)}</p></div>`,
      )
      .join("") +
    (data.warnings || [])
      .map((w) => `<p class="warning">${escape(w)}</p>`)
      .join("");
  controls();
  canvasScale = 1;
  render();
  await refreshSidebar();
  await renderVersionDiff();
  const versions = await api("/api/spaces/" + data.id + "/versions");
  $("history").innerHTML = versions
    .map(
      (v) =>
        `<button class="history-item ${v.id === data.id ? "selected" : ""}" data-space="${v.id}"><span>v${v.version}${v.id === data.id ? " · 当前" : ""}</span><small>${new Date(v.savedAt).toLocaleString("zh-CN")}</small></button>`,
    )
    .join("");
}
function controls() {
  const branch = scenarios.find(s => s.id === selectedScenarioId);
  $("scenario-name").value = branch?.name || "";
  $("remove-scenario").disabled = selectedScenarioId==='scenario-baseline' || scenarios.length < 2;
  $("calculation-mode").value = settings.calculationMode || "reviewed";
  $("calculation-mode").disabled = !modernBackend;
  $("budget").min = 0;
  $("budget").max = Math.max(15000, settings.budget);
  $("max-weight").max = Math.max(3, settings.maxWeight);
  if (
    ![...$("memory").options].some(
      (o) => Number(o.value) === settings.minMemory,
    )
  )
    $("memory").add(
      new Option(settings.minMemory + " GB", String(settings.minMemory)),
    );
  $("budget").value = settings.budget;
  $("memory").value = settings.minMemory;
  $("max-weight").value = settings.maxWeight;
  $("weight-controls").innerHTML = Object.entries(dimensions)
    .map(
      ([k, d]) =>
        `<label for="pref-${k}">${d.label}<output id="pref-value-${k}">${settings.weights[k]}</output></label><input id="pref-${k}" data-pref="${k}" type="range" min="0" max="100" step="1" value="${settings.weights[k]}">`,
    )
    .join("");
}
function render() {
  const branch = scenarios.find(s => s.id === selectedScenarioId);
  if (branch) {
    if(/^预算收紧到 \d+ 元$/.test(branch.name))branch.name=`预算收紧到 ${settings.budget} 元`;
    if(/^通勤：重量不超过 [\d.]+ kg$/.test(branch.name))branch.name=`通勤：重量不超过 ${settings.maxWeight} kg`;
    branch.settings = structuredClone(settings);
  }
  renderDecisionViews();
  const activeCandidates=scenarioCandidates(space,branch);
  const provisional = settings.calculationMode === "provisional";
  const facts = activeCandidates.flatMap(c => Object.entries(c.facts));
  const confirmed = facts.filter(([, f]) => f.status === "confirmed").length;
  const cited = facts.filter(([k, f]) => f.status === "unreviewed" && !factIssue(k, f)).length;
  const unavailable = facts.length - confirmed - cited;
  const pageCount=space.sources.length, fullText=space.sources.filter(s=>s.kind==="page"||s.kind==="fixture").length;
  const canTrial=evaluate(activeCandidates,{...settings,calculationMode:"provisional"}).some(c=>c.status==="eligible");
  $("research-overview").innerHTML=`<div><strong>${space.mode==="demo"?"演示资料已就绪":unavailable?"资料尚有缺项":"参数已有引用"}</strong><span>${pageCount} 个来源 → ${fullText} 份正文 → ${confirmed+cited}/${facts.length} 项参数有依据</span><p>${space.mode==="demo"?"选择不同情景，查看方案如何改变。演示中的产品与数值均为虚构。":"这是已保存的研究快照。补充检索会搜索新页面；更新原网页只重读已有链接。"}</p></div><div><button type="button" data-open-evidence>查看缺项与来源</button>${canTrial&&cited&&settings.calculationMode!=="provisional"?'<button type="button" id="try-cited">使用引用试算</button>':""}</div>`;
  if(activeCandidates.every(c=>c.productData?.status==='comparison-ready')){
    const urls=new Set(space.sources.map(s=>s.url).filter(Boolean));
    $("research-overview").innerHTML=`<div><strong>从页面证据，到条件推演</strong><span>${activeCandidates.length} 个真实方案 · ${urls.size} 个商品页 · ${activeCandidates.reduce((n,c)=>n+Object.keys(c.productData.fields).length,0)} 项核心字段有原文</span><p>公开页面标价用于信息比较，库存仅作附注。数据保留来源和采集时间。</p></div><div><button type="button" data-open-evidence>查看参数与证据 ↗</button>${canTrial&&settings.calculationMode!=='provisional'?'<button type="button" id="try-cited">使用引用试算</button>':''}</div>`;
  }
  $("research-overview").querySelector("[data-open-evidence]").onclick=()=>setWorkspacePane("evidence");
  if(space.mode!=="demo"&&!activeCandidates.every(c=>c.productData)){
    const engines=[...new Set(space.sources.map(s=>s.retrieval?.engine).filter(s=>s&&s!=="未记录"))];
    $("research-overview").querySelector("p").append(engines.length?` 实际返回引擎：${engines.join("、")}。`:" 此旧快照未记录具体搜索引擎。");
  }
  if($("try-cited"))$("try-cited").onclick=()=>{ensureEditableScenario();settings.calculationMode="provisional";controls();setDirty(true);render();};
  $("supplement-button").hidden=space.mode==="demo";
  $("supplement-button").disabled=!supplementBackend;
  $("quality-summary").textContent = `当前条件：预算 ${money(settings.budget)} · 内存至少 ${settings.minMemory} GB · 重量不超过 ${settings.maxWeight} kg。资料覆盖：${confirmed} 项已确认 · ${cited} 项有引用待核验 · ${unavailable} 项缺失或存在疑点 · ${space.sources.length} 条保存的来源。来源数量不代表参数已核实。`;
  $("calculation-note").textContent = provisional
    ? "试算结果不代表已核验。缺失、单位不明、多配置内存与起售价等数据仍不可用于排名。"
    : "有引用不等于已核验。可点击参数检查原文后确认，也可主动切换到试算。";
  $("skip-battery").hidden = !settings.weights.battery || !activeCandidates.some(c => c.facts.battery.value === null);
  const ranked = evaluate(activeCandidates, settings),
    winner = ranked.find((c) => c.status === "eligible");
  $("budget-value").textContent = money(settings.budget);
  $("weight-value").textContent = settings.maxWeight.toFixed(2) + " kg";
  for (const k of Object.keys(dimensions))
    $("pref-value-" + k).textContent = settings.weights[k];
  const diff = comparison(evaluate(activeCandidates, space.settings), ranked);
  $("recommendation").innerHTML = winner
    ? `<div class="rec-icon">↗</div><div><span class="eyebrow">${provisional ? "试算优先方案" : "当前模型下的优先方案"}</span><h3>${escape(winner.name)} <small>${winner.score.toFixed(1)} / 100</small></h3><p>${diff.changed ? `相对已保存设置，优先方案从 ${escape(diff.previous || "暂无")} 变为 ${escape(diff.current)}。` : provisional ? "仅供探索条件变化；购买前请核对具体配置和实际售价。" : "满足已确认的硬性约束，并在当前偏好权重下得分最高。"}${diff.entered.length ? " 新进入范围：" + escape(diff.entered.join("、")) + "。" : ""}${diff.exited.length ? " 退出范围：" + escape(diff.exited.join("、")) + "。" : ""}</p></div>`
    : `<div class="rec-icon">?</div><div><h3>${ranked.every(r => r.status === "excluded" || r.status === "disabled") ? "当前条件下没有合适方案" : "资料尚不足以排名"}</h3><p>${escape([...new Set(ranked.filter(r => r.status !== "disabled").flatMap(r => [...r.reasons, ...r.unknown]))].join("；"))}。${settings.weights.battery && activeCandidates.some(c => c.facts.battery.value === null) ? "缺少标称续航会阻止评分；若暂不关注，可将续航权重设为 0。" : ""}</p></div>`;
  $("candidate-table").innerHTML = ranked
    .map((r) => {
      const c = activeCandidates.find((c) => c.id === r.id);
      const proposed = space.mode !== "demo" && !c.originalName && !c.id.startsWith("manual-");
      const label = proposed ? c.name.replace(/\s*[(（][^()（）]*[)）]/g, "").trim() || c.name : c.name;
      return `<tr class="${r.id === winner?.id ? "winner-row" : ""}"><td><strong>${escape(label)}</strong><small>${proposed ? "检索候选 · 配置及开发兼容性待核实" : escape(c.tag)}</small>${proposed && (c.proposedName || c.name) !== label ? `<details><summary>查看 AI 提议配置（未核实）</summary>${escape(c.proposedName || c.name)}</details>` : ""}</td>${Object.entries(
        dimensions,
      )
        .map(([k, d]) => {
          const f = c.facts[k];
          const issue = factIssue(k, f);
          return `<td><button class="fact ${f.status !== "confirmed" ? "unverified" : ""}" data-candidate="${c.id}" data-fact="${k}" aria-label="查看 ${escape(c.name)} 的${d.label}证据">${f.value === null ? "—" : k === "price" ? money(f.value) : escape(f.value) + "<small>" + d.unit + "</small>"}<span>${escape(f.confirmation === "user-assumption" ? "个人假设" : f.status === "confirmed" ? "已确认" : issue || "有引用·未核验")}</span></button></td>`;
        })
        .join(
          "",
        )}<td><span class="result-badge ${r.status}">${r.status === "eligible" ? (provisional ? "试算 " : "") + r.score.toFixed(1) + " 分" : r.status === "excluded" ? "不满足约束" : r.status === "disabled" ? "已暂停" : "资料不足以排名"}</span><small>${escape([...r.reasons, ...r.unknown].join("；"))}</small></td></tr>`;
    })
    .join("");
  $("thresholds").innerHTML = budgetTransitions(activeCandidates, settings)
    .filter((t) => t.budget > 0)
    .map(
      (t) =>
        `<button class="threshold ${t.budget === settings.budget ? "current" : ""}" data-budget="${t.budget}"><span>${money(t.budget)}</span><strong>${escape(t.name || "暂无可排名方案")}</strong><small>${provisional ? "试算 · " : ""}${t.eligible.length} 个方案可比较${t.changed ? " · 优先方案变化" : ""}</small></button>`,
    )
    .join("");
}
async function save(reviews = [], candidateEdits = [],decision=undefined) {
  if(candidateEdits.some(e=>e.action==='add'))ensureEditableScenario();
  const data = await api("/api/spaces/" + space.id + "/versions", {
    method: "POST",
    body: JSON.stringify({ settings, reviews, candidateEdits, decision,activeScenarioId:selectedScenarioId, scenarios: scenarioPayload(scenarios) }),
  });
  await load(data);
  toast("已保存为 v" + data.version + "，旧版本仍然保留。");
}
function evidence(candidateId, key) {
  const c = space.candidates.find((c) => c.id === candidateId),
    f = c.facts[key],
    d = dimensions[key];
  const source = space.sources.find((s) => s.id === f.sourceId),
    original = space.sources.find((s) => s.id === f.original?.sourceId);
  $("evidence-title").textContent = c.name + " · " + d.label;
  $("evidence-body").innerHTML =
    `<div class="evidence-status">${f.confirmation === "user-assumption" ? "个人假设 · 已覆盖原始值" : f.status === "confirmed" ? "已确认参数" : f.status === "unreviewed" ? "引文匹配 · 语义尚待人工核验" : "未知 · 缺少可匹配证据"}</div>${source ? `<h3>${escape(source.title)}</h3><p class="muted">${source.kind === "fixture" ? "固定虚构测试资料" : "检索时间：" + new Date(source.retrievedAt).toLocaleString("zh-CN")}</p><blockquote>${escape(f.quote)}</blockquote>${source.url ? `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a>` : ""}<details><summary>查看本次保存的来源文本</summary><pre>${escape(source.text)}</pre></details>` : `<p>当前值没有直接支持它的已匹配来源。你可以录入个人假设，系统会明确区分假设和来源事实。</p>`}${original ? `<details><summary>查看覆盖前的来源</summary><p>原始值：${escape(f.original.value)} ${d.unit}</p><blockquote>${escape(f.original.quote)}</blockquote></details>` : ""}<form id="review-form"><label for="review-value">${d.label}（${d.unit}）</label><input id="review-value" type="number" step="any" min="0.001" max="1000000" required value="${f.value ?? ""}">${source ? `<label for="review-quote">关联新的原文引文（可选）</label><textarea id="review-quote" maxlength="2000" placeholder="来源更新后，可粘贴包含新数值的原文片段；留空按原规则保存。"></textarea>` : ""}<p class="muted">保留原值表示你已核验原文、单位和配置；修改值会保存为个人假设。保存时同时记录当前条件与新版本。</p><button class="primary" type="submit">确认参数并保存版本</button></form>`;
  const rejected = f.rejectedEvidence;
  if (modernBackend && space.sources.length) {
    $("review-form").insertAdjacentHTML("afterbegin", `<label for="review-source">新引文来自哪个来源</label><select id="review-source">${space.sources.map(s => `<option value="${escape(s.id)}" ${s.id === f.sourceId ? "selected" : ""}>${escape(s.id + " · " + s.title)}</option>`).join("")}</select>`);
    if (!$("review-quote")) $("review-value").insertAdjacentHTML("afterend", '<label for="review-quote">关联新的原文引文（可选）</label><textarea id="review-quote" maxlength="2000" placeholder="从所选来源粘贴支持该数值的原文；留空保存为个人假设。"></textarea>');
  }
  if (f.conflictingEvidence) {
    $("evidence-body").insertAdjacentHTML("afterbegin", `<details><summary>查看冲突数值（不参与计算）</summary>${f.conflictingEvidence.map(item => `<p>${escape(item.value)} ${d.unit} · 来源 ${escape(item.sourceId)}</p><blockquote>${escape(item.quote)}</blockquote>`).join("")}</details>`);
  }
  if(key==='price'&&c.priceObservations?.length){
    const prices=c.priceObservations.filter(p=>p.kind==='aggregator-reference'&&Number.isFinite(p.value)&&space.sources.some(s=>s.id===p.sourceId&&s.text?.includes(p.quote)));
    $("evidence-body").insertAdjacentHTML('afterbegin',`<section class="reference-review"><h3>已找到的平台参考报价</h3><p>尚未核实商家结算价。填入后保存会记为个人假设，用于探索预算变化。</p>${prices.map(p=>{const s=space.sources.find(s=>s.id===p.sourceId);return `<div><strong>${money(p.value)}</strong><p>${escape(p.configuration)}</p><blockquote>${escape(p.quote)}</blockquote><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">打开报价来源 ↗</a><button type="button" data-use-reference-price="${p.value}">填入此参考价（个人假设）</button></div>`}).join('')}</section>`);
    for(const button of $("evidence-body").querySelectorAll('[data-use-reference-price]'))button.onclick=()=>{$("review-value").value=button.dataset.useReferencePrice;$("review-value").scrollIntoView({block:'center'});$("review-value").focus();};
  }
  $("evidence-body").insertAdjacentHTML("afterbegin", `<p class="warning">${escape(factIssue(key, f) || "请核对该数值是否对应当前候选的具体配置。")}</p>${rejected ? `<details><summary>查看未通过检查的提取（不参与计算）</summary><p>${escape(rejected.value ?? "未知")} ${d.unit}</p><blockquote>${escape(rejected.quote)}</blockquote>${space.sources.find(s => s.id === rejected.sourceId)?.url ? `<a href="${escape(space.sources.find(s => s.id === rejected.sourceId).url)}" target="_blank" rel="noopener noreferrer">打开被引用的来源 ↗</a>` : ""}</details>` : ""}`);
  if (!modernBackend) {
    const field = $("review-quote");
    if (field) {
      field.previousElementSibling?.remove();
      field.remove();
    }
  }
  if (f.reviewReason) {
    const note = document.createElement("p");
    note.className = "review-reason";
    note.textContent = f.reviewReason;
    $("evidence-body").prepend(note);
    if (f.previousObservation) {
      const old = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "查看刷新前的参数";
      old.append(summary);
      const p = document.createElement("p");
      p.textContent = `原值：${f.previousObservation.value ?? "未知"} ${d.unit}；原引文：${f.previousObservation.quote || "无"}`;
      old.append(p);
      $("evidence-body").append(old);
    }
  }
  $("review-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    try {
      await save([
        {
          candidateId,
          key,
          value: Number($("review-value").value),
          ...($("review-quote")?.value.trim()
            ? { quote: $("review-quote").value, sourceId: $("review-source")?.value || source?.id }
            : {}),
        },
      ]);
      $("evidence-dialog").close();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };
  $("evidence-dialog").showModal();
}
$("close-evidence").onclick = () => $("evidence-dialog").close();
$("new-space").onclick = () => {
  if (busy) return toast("研究正在进行，请等待完成。");
  show("welcome");
  $("breadcrumb").textContent = "开始探索";
};
$('import-space').onclick=()=>{if(busy)return toast('研究正在进行，请等待完成。');$('import-file').click();};
$('import-file').onchange=async()=>{
  const file=$('import-file').files[0];if(!file)return;
  $('import-space').disabled=true;
  try{
    if(file.size>5*1024*1024)throw new Error('决策文件不能超过 5 MB');
    let snapshot;try{snapshot=JSON.parse(await file.text());}catch{throw new Error('无法读取 JSON，请选择 Prism 导出的决策文件');}
    await load(await api('/api/spaces/import',{method:'POST',body:JSON.stringify(snapshot)}));
    toast('已创建独立空间，原文件和历史空间保持保留。引用需要在本机重新确认。');
  }catch(error){toast(error.message);}
  finally{$('import-space').disabled=false;$('import-file').value='';}
};
$("demo-button").onclick = async () => {
  const b = $("demo-button");
  b.disabled = true;
  try {
    await load(await api("/api/spaces/demo", { method: "POST" }));
  } catch (e) {
    toast(e.message);
  } finally {
    b.disabled = false;
  }
};
$("save-button").onclick = async () => {
  const b = $("save-button");
  b.disabled = true;
  try {
    await save();
  } catch (e) {
    toast(e.message);
  } finally {
    b.disabled = false;
  }
};
$("export-button").onclick = () => {
  if (dirty) toast("导出的是已保存版本；如需当前修改，请先保存。");
  window.location.href = "/api/spaces/" + space.id + "/export";
};
$("reset-button").onclick = () => {
  scenarios = initialScenarios(space);
  selectedScenarioId = scenarios[0].id;
  settings = structuredClone(space.settings);
  controls();
  render();
  setDirty(false);
};
function renderDecisionViews() {
  const selected = scenarios.find(s => s.id === selectedScenarioId);
  if (!selected) return;
  const canvas = canvasView(space, scenarios, selectedScenarioId);
  $("decision-insight").innerHTML=decisionSummaryView(space,selected);
  if(space.candidates.every(c=>c.productData)){
    const points=[...new Set(space.candidates.filter(c=>!factIssue('price',c.facts.price)).map(c=>c.facts.price.value))].sort((a,b)=>a-b);
    $('decision-insight').querySelector('.decision-summary-main').insertAdjacentHTML('beforeend',`<div class="decision-thresholds"><span>试试预算拐点</span>${points.map(p=>`<button type="button" data-budget="${p}">${money(p)} ↗</button>`).join('')}</div>`);
  }
  const switches=`<nav class="scenario-switches" aria-label="选择 What-if 情景">${scenarios.map((s,i)=>{const winner=evaluate(scenarioCandidates(space,s),s.settings).find(r=>r.status==='eligible');const candidate=space.candidates.find(c=>c.id===winner?.id);return `<button type="button" data-select-scenario="${escape(s.id)}" aria-pressed="${s.id===selectedScenarioId}" class="${s.id===selectedScenarioId?"active":""}"><span>${String(i+1).padStart(2,"0")}</span><div><strong>${escape(s.name)}</strong><small>¥${Number(s.settings.budget).toLocaleString("zh-CN")} · ≥${s.settings.minMemory}GB · ≤${s.settings.maxWeight}kg</small>${space.candidates.every(c=>c.productData)?`<em>→ ${escape(candidate?.name||'没有匹配方案')}</em>`:''}</div></button>`}).join("")}</nav>`;
  const mapOpen=$('scenario-scene').querySelector('.scenario-map-details')?.open??false;
  const shelfOpen=$('scenario-scene').querySelector('.candidate-shelf')?.open??!!(space.comparisonData&&!space.comparisonData.comparisonReady?.length);
  const logOpen=explorationPanel.querySelector('.exploration-log')?.open??false;
  mapTools.remove();
  explorationPanel.innerHTML=`${switches}${explorationView(space,selected,explorationJob?.scenarioId===selected.id?explorationJob:null,scenarioFocus.get(selected.id),conditionOrigins.get(selected.id))}`;
  explorationPanel.querySelector('.exploration-log').open=logOpen;
  $("scenario-scene").innerHTML = `<details class="candidate-shelf" ${shelfOpen?'open':''}><summary>查看候选与报价 <span>${scenarioCandidates(space,selected).length} 个方案</span></summary>${canvas.products}</details><details class="scenario-map-details" ${mapOpen?'open':''}><summary>查看所有分支 <span>原始条件 → 不同选择</span></summary><div class="scenario-map" aria-label="情景分支关系"><div class="map-size"><div class="canvas-content">${canvas.html}</div></div></div></details>`;
  $('scenario-scene').querySelector('.scenario-map-details > summary').after(mapTools);
  const content = $("scenario-scene").querySelector(".canvas-content");
  const mapSize = content.parentElement;
  mapSize.style.width = canvas.width * canvasScale + "px";
  mapSize.style.height = canvas.height * canvasScale + "px";
  content.style.width = canvas.width + "px";
  content.style.height = canvas.height + "px";
  content.style.transform = `scale(${canvasScale})`;
  for (const node of content.querySelectorAll("[data-x]")) {
    node.style.left = node.dataset.x + "px";
    node.style.top = node.dataset.y + "px";
  }
  $("canvas-zoom-label").textContent = Math.round(canvasScale * 100) + "%";
  $("scenario-version").textContent = `基准 v${space.version} · ${scenarios.length} 条情景分支`;
  $("selected-scenario-label").textContent = "正在编辑：" + selected.name;
  $("scenario-impact").innerHTML = space.candidates.every(c=>c.productData)?`<details class="calculation-details"><summary>计算明细 · 条件变化、评分与候选进入/退出</summary>${impactView(space,selected)}</details>`:impactView(space, selected);
  for (const bar of $("scenario-impact").querySelectorAll("[data-score-width]")) bar.style.width = bar.dataset.scoreWidth + "%";
  $("source-candidate").innerHTML = space.candidates.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join("");
  $("source-candidate").value = sourceCandidateId;
  const sources = sourceView(space, sourceCandidateId);
  $("source-summary").textContent = sources.summary;
  $("source-matrix").innerHTML = sources.html;
  $("source-library-title").textContent = `全部检索来源（${space.sources.length}）· 查看引用关系`;
  $("source-library").innerHTML = sources.library;
  $("specification-comparison").innerHTML=specificationComparisonView(space);
  document.querySelector('.source-comparison h2').textContent=space.candidates.every(c=>c.productData)?'每个关键参数，都能追溯原文。':'同一方案，不同来源怎么说？';
  $("candidate-table").closest('.table-wrap').hidden=space.candidates.every(c=>c.productData?.status==='comparison-ready')||!!space.comparisonData&&!space.comparisonData.comparisonReady?.length;
}
$("source-candidate").onchange = e => { sourceCandidateId = e.target.value; renderDecisionViews(); };
$("supplement-button").onclick=async()=>{
  if(busy)return;
  if(dirty){toast("请先保存当前情景，再按已保存条件补充检索。");return;}
  try {
    const job=await api("/api/spaces/"+space.id+"/research",{method:"POST"});
    await watchJob(job.id);
  }catch(error){toast(error.message);}
};
$("scenario-name").oninput = e => {
  if(busy){controls();return;}
  ensureEditableScenario();
  const selected = scenarios.find(s => s.id === selectedScenarioId);
  if (e.target.value.trim()) selected.name = e.target.value.trim().slice(0, 40);
  setDirty(true);
  renderDecisionViews();
};
$("remove-scenario").onclick = () => {
  if(busy)return;
  if (selectedScenarioId==='scenario-baseline' || scenarios.length < 2) return;
  scenarios = scenarios.filter(s => s.id !== selectedScenarioId);
  selectedScenarioId = scenarios[0].id;
  settings = structuredClone(scenarios[0].settings);
  controls(); setDirty(true); render();
};
document.addEventListener("click", e => {
  const nudge=e.target.closest('[data-nudge-budget]');
  if(nudge){applyQuickCondition('budget',Math.max(0,Math.min(1000000,settings.budget+Number(nudge.dataset.nudgeBudget))));return;}
  const focus=e.target.closest('[data-focus-candidate]');
  if(focus){scenarioFocus.set(selectedScenarioId,focus.dataset.focusCandidate);renderDecisionViews();return;}
  if(e.target.closest('[data-scroll-choices]')){document.querySelector('.choice-options-list')?.scrollBy({left:400,behavior:'smooth'});return;}
  if(e.target.closest("[data-explore-scenario]")){exploreScenario();return;}
  if(e.target.closest('[data-view-research]')){setWorkspacePane('history');return;}
  const detail=e.target.closest('[data-detail-candidate]');
  if(detail){
    const c=space.candidates.find(c=>c.id===detail.dataset.detailCandidate),f=c?.productData?.fields[detail.dataset.detailKey];
    if(!f)return;
    const source=space.sources.find(s=>s.id===f.sourceId);
    $("evidence-title").textContent=c.name+' · '+({cpu:'处理器',storageGB:'固态硬盘',os:'操作系统',screenResolution:'屏幕分辨率'}[detail.dataset.detailKey]||detail.dataset.detailKey);
    $("evidence-body").innerHTML=`<div class="evidence-status">已保存的来源原文</div><h3>${escape(f.value)}</h3><blockquote>${escape(f.quote)}</blockquote>${source?`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a><p class="muted">采集时间：${escape(new Date(source.retrievedAt).toLocaleString('zh-CN'))}</p>`:''}`;
    $("evidence-dialog").showModal();return;
  }
  const sourceButton=e.target.closest("[data-product-sources]");
  if(sourceButton){
    sourceCandidateId=sourceButton.dataset.productSources;
    renderDecisionViews();setWorkspacePane("evidence");
    document.querySelector(".source-comparison").scrollIntoView({block:"start",behavior:"smooth"});
    return;
  }
  const select = e.target.closest("[data-select-scenario]");
  if (select) {
    if(busy)return toast("本轮研究完成后可切换情景。");
    selectedScenarioId = select.dataset.selectScenario;
    settings = structuredClone(scenarios.find(s => s.id === selectedScenarioId).settings);
    controls(); setDirty(true); render(); return;
  }
  const add = e.target.closest("[data-add-scenario]");
  if (!add) return;
  if(busy)return toast("请等待当前研究完成。");
  if (scenarios.length >= 24) { toast("最多保存 24 条情景，当前情况会始终保留。"); return; }
  const next = structuredClone(settings);
  if (add.dataset.addScenario === "budget") next.budget = Math.min(1000000, next.budget + 1000);
  if (add.dataset.addScenario === "light") next.maxWeight = 1.3;
  const branch = { id: "scenario-" + crypto.randomUUID(), name: add.dataset.addScenario === "budget" ? "如果预算增加 1000 元" : add.dataset.addScenario === "light" ? "如果重量限制 1.3 kg" : "自定义情景 " + (scenarios.length + 1), settings: next,parentScenarioId:selectedScenarioId,candidateIds:scenarioCandidates(space,scenarios.find(s=>s.id===selectedScenarioId)).map(c=>c.id) };
  scenarios.push(branch); selectedScenarioId = branch.id; settings = next;
  controls(); setDirty(true); render();
  if(add.dataset.addScenario!=="copy" && space.mode!=="demo")exploreScenario();
  else if(add.dataset.addScenario==="copy" && $("scenario-inspector").hidden)$("toggle-scenario-editor").click();
});
function applyQuickCondition(key,value){
  if(busy)return toast('请等待当前研究完成。');
  const next=validateSettings({...structuredClone(settings),[key]:value});
  ensureEditableScenario();
  if(!conditionOrigins.has(selectedScenarioId))conditionOrigins.set(selectedScenarioId,structuredClone(settings));
  settings=next;controls();setDirty(true);render();
}
document.addEventListener('change',e=>{
  if(!e.target.matches('[data-quick-condition]'))return;
  const key=e.target.dataset.quickCondition;
  if(!['minMemory','maxWeight'].includes(key))return;
  try{applyQuickCondition(key,Number(e.target.value));}catch(error){toast(error.message);}
});
$("canvas-zoom-in").onclick = () => { canvasScale = Math.min(1.5, canvasScale + 0.1); renderDecisionViews(); };
$("canvas-zoom-out").onclick = () => { canvasScale = Math.max(0.35, canvasScale - 0.1); renderDecisionViews(); };
$("canvas-fit").onclick = () => { canvasScale = Math.min(1, Math.max(0.35, ($("scenario-viewport").clientWidth - 32) / 860)); renderDecisionViews(); };
document.addEventListener("error", e => {
  if (e.target.matches?.(".product-image img")) {
    e.target.hidden = true;
    e.target.nextElementSibling.hidden = false;
  }
}, true);
document.addEventListener("load", e => {
  if(e.target.matches?.(".product-image img")) e.target.classList.toggle("portrait-source",e.target.naturalHeight>e.target.naturalWidth*1.2);
},true);
let pan = null;
$("scenario-viewport").addEventListener("pointerdown", e => {
  if (e.pointerType !== "mouse" || !e.target.closest(".scenario-map") || e.target.closest("button,a")) return;
  const viewport = $("scenario-viewport").querySelector(".scenario-map");
  pan = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.setPointerCapture(e.pointerId);
});
$("scenario-viewport").addEventListener("pointermove", e => {
  if (!pan) return;
  const viewport = $("scenario-viewport").querySelector(".scenario-map");
  viewport.scrollLeft = pan.left - e.clientX + pan.x;
  viewport.scrollTop = pan.top - e.clientY + pan.y;
});
$("scenario-viewport").addEventListener("pointerup", () => { pan = null; });
$("scenario-viewport").addEventListener("pointercancel", () => { pan = null; });
$("skip-battery").onclick = () => {
  if (!Object.entries(settings.weights).some(([k, v]) => k !== "battery" && v > 0)) {
    toast("请先给其他比较维度设置非零权重。");
    return;
  }
  ensureEditableScenario();
  settings.weights.battery = 0;
  controls();
  setDirty(true);
  render();
};
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-space],[data-fact],[data-budget]");
  if (!target) return;
  try {
    if (target.dataset.space) {
      if (busy) return toast("请先等待当前研究完成。");
      await load(await api("/api/spaces/" + target.dataset.space));
    } else if (target.dataset.fact)
      evidence(target.dataset.candidate, target.dataset.fact);
    else if (target.dataset.budget) {
      ensureEditableScenario();
      settings.budget = Number(target.dataset.budget);
      $("budget").value = settings.budget;
      setDirty(true);
      render();
    }
  } catch (error) {
    toast(error.message);
  }
});
$("workspace").addEventListener("input", (e) => {
  if (!e.target.matches("#budget,#memory,#max-weight,#calculation-mode,[data-pref]")) return;
  if(busy){controls();return;}
  const next = {
    calculationMode: $("calculation-mode").value,
    budget: Number($("budget").value),
    minMemory: Number($("memory").value),
    maxWeight: Number($("max-weight").value),
    weights: Object.fromEntries(
      Object.keys(dimensions).map((k) => [k, Number($("pref-" + k).value)]),
    ),
  };
  try {
    const valid=validateSettings(next);
    ensureEditableScenario();
    settings = valid;
    setDirty(true);
    render();
  } catch (error) {
    toast(error.message);
    controls();
    render();
  }
});
$("research-form").onsubmit = async (e) => {
  e.preventDefault();
  if (busy) return;
  try {
    const config = await api("/api/settings");
    if (!config.ready) {
      await openSettings();
      return;
    }
    const job = await api("/api/research", {
      method: "POST",
      body: JSON.stringify({ question: classicView?$("question").value:taskQuestion($("question").value),adaptive:!classicView }),
    });
    clearTaskStart();
    await watchJob(job.id);
  } catch (error) {
    toast(error.message);
  }
};
window.addEventListener("beforeunload", (e) => {
  if (dirty||universalRoot.__hasUnsavedUniversal?.()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("hashchange", async () => {
  const id = location.hash.slice(1);
  if (/^job-[a-f0-9-]{36}$/.test(id)) {
    await watchJob(id.slice(4));
    return;
  }
  if (/^[a-f0-9-]{36}$/.test(id) && id !== space?.id) {
    try {
      await load(await api("/api/spaces/" + id));
    } catch (error) {
      toast(error.message);
    }
  }
});

async function renderVersionDiff() {
  if (!modernBackend) {
    $("diff-panel").hidden = true;
    return;
  }
  const diff = await api("/api/spaces/" + space.id + "/diff");
  $("diff-panel").hidden = !diff;
  if (!diff) return;
  const labels = {
    budget: "预算上限",
    minMemory: "最低内存",
    maxWeight: "重量上限",
    calculationMode: "计算依据",
  };
  const lines = [];
  if(diff.decisionChange){
    const {before,after}=diff.decisionChange;
    lines.push(`记录选择：${before?.candidateName||'还在考虑'} → ${after?.candidateName||'还在考虑'}`);
    if(before?.rationale!==after?.rationale)lines.push('已保存这次判断的理由');
  }
  for (const change of diff.settingsChanges)
    lines.push(
      `${labels[change.field] || "偏好：" + (dimensions[change.field.split(".")[1]]?.label || change.field)}：${change.field === "calculationMode" ? (change.before === "provisional" ? "试算" : "仅已确认") : change.before} → ${change.field === "calculationMode" ? (change.after === "provisional" ? "试算" : "仅已确认") : change.after}`,
    );
  for (const change of diff.candidateChanges)
    lines.push(
      change.type === "renamed"
        ? `方案更名：${change.before} → ${change.after}`
        : `${{ added: "新增方案", disabled: "暂停比较", enabled: "恢复比较" }[change.type]}：${change.name}`,
    );
  const statuses = {
    confirmed: "已确认",
    unreviewed: "待核验",
    unknown: "未知",
  };
  for (const change of diff.factChanges)
    lines.push(
      `${change.name} / ${dimensions[change.field].label}：${change.before.value ?? "未知"}（${statuses[change.before.status] || change.before.status}） → ${change.after.value ?? "未知"}（${statuses[change.after.status] || change.after.status}）`,
    );
  for (const change of diff.sourceChanges)
    lines.push(
      `${change.status === "unavailable" ? "无法刷新，保留旧资料" : "资料快照变化"}：${change.title}`,
    );
  for (const change of diff.scenarioChanges || []) lines.push(`${{ added: "新增情景分支", changed: "修改情景分支", removed: "删除情景分支" }[change.type]}：${change.name}`);
  if (diff.ranking.changed)
    lines.push(
      `优先方案：${diff.ranking.previous || "暂无"} → ${diff.ranking.current || "暂无"}`,
    );
  $("version-diff").innerHTML = lines.length
    ? "<ul>" +
      lines.map((line) => "<li>" + escape(line) + "</li>").join("") +
      "</ul>"
    : "<p>参数和排名均未变化。资料检查结果已记录在本版本中。</p>";
}
$("manage-candidates").onclick = () => {
  $("new-candidate-name").value = "";
  $("candidate-edit-list").innerHTML = space.candidates
    .map(
      (c) =>
        `<div class="candidate-edit-row" data-edit-id="${c.id}"><label>方案名称<input type="text" class="candidate-name" value="${escape(c.name)}" maxlength="150" required aria-label="${escape(c.name)} 方案名称"></label><label class="enabled-label"><input type="checkbox" class="candidate-enabled" ${c.enabled !== false ? "checked" : ""}>参与比较</label></div>`,
    )
    .join("");
  $("candidates-dialog").showModal();
};
$("close-candidates").onclick = () => $("candidates-dialog").close();
$("candidates-form").onsubmit = async (e) => {
  e.preventDefault();
  const edits = [];
  for (const row of $("candidate-edit-list").children) {
    const old = space.candidates.find((c) => c.id === row.dataset.editId),
      name = row.querySelector(".candidate-name").value.trim(),
      enabled = row.querySelector(".candidate-enabled").checked;
    if (name !== old.name)
      edits.push({ action: "rename", candidateId: old.id, name });
    if (enabled !== (old.enabled !== false))
      edits.push({ action: "toggle", candidateId: old.id, enabled });
  }
  const name = $("new-candidate-name").value.trim();
  if (name) edits.push({ action: "add", name });
  if (!edits.length) return $("candidates-dialog").close();
  e.submitter.disabled = true;
  try {
    await save([], edits);
    $("candidates-dialog").close();
  } catch (error) {
    toast(error.message);
  } finally {
    e.submitter.disabled = false;
  }
};
async function listJobs() {
  const jobs = await api("/api/jobs");
  const labels = {
    running: "运行中",
    failed: "失败，可继续",
    interrupted: "中断，可继续",
    complete: "已完成",
  };
  $("jobs-list").innerHTML = jobs.length
    ? jobs
        .slice(0, 30)
        .map(
          (j) =>
            `<div class="job-row"><div><strong>${escape(j.type === "refresh" ? "资料刷新" : j.question)}</strong><p>${labels[j.status] || escape(j.status)} · ${new Date(j.createdAt).toLocaleString("zh-CN")}</p></div><button class="secondary" data-job-id="${j.id}">${j.status === "complete" ? "打开结果" : j.status === "running" ? "查看进度" : "查看并继续"}</button></div>`,
        )
        .join("")
    : '<p class="muted">还没有研究任务。演示空间不会调用 Agent。</p>';
}
$("jobs-button").onclick = async () => {
  try {
    await listJobs();
    $("jobs-dialog").showModal();
  } catch (error) {
    toast(error.message);
  }
};
$("close-jobs").onclick = () => $("jobs-dialog").close();
$("jobs-list").onclick = async (e) => {
  const target = e.target.closest("[data-job-id]");
  if (!target) return;
  $("jobs-dialog").close();
  await watchJob(target.dataset.jobId);
};
$("leave-job").onclick = () => {
  watchGeneration++;
  busy = false;
  activeJobId = null;
  $("research-button").disabled = false;
  show("welcome");
  history.replaceState(null, "", location.pathname);
};
$("resume-job").onclick = async () => {
  try {
    await api("/api/jobs/" + activeJobId + "/resume", { method: "POST" });
    await watchJob(activeJobId);
  } catch (error) {
    toast(error.message);
  }
};
$("reconnect-job").onclick = () => watchJob(activeJobId);
$("refresh-button").onclick = async () => {
  if (dirty) return toast("请先保存当前条件修改，再刷新资料。");
  try {
    const job = await api("/api/spaces/" + space.id + "/refresh", {
      method: "POST",
    });
    await watchJob(job.id);
  } catch (error) {
    toast(error.message);
  }
};
async function exploreScenario(){
  if(busy)return;
  if(space.mode==='demo')return toast('演示数据仅用于本地推演。请新建联网研究后探索真实方案。');
  if(!scenarioBackend)return toast('当前服务尚未加载情景研究功能，请打开本次更新后的预览地址。');
  const failed=explorationJob&&explorationJob.scenarioId===selectedScenarioId&&['failed','interrupted'].includes(explorationJob.status);
  busy=true;
  try{
    if(failed){
      const latest=await api('/api/jobs/'+explorationJob.id);
      const job=['failed','interrupted'].includes(latest.status)?await api('/api/jobs/'+explorationJob.id+'/resume',{method:'POST'}):latest;
      return await watchExploration(job);
    }
    if(dirty)await save();
    const job=await api('/api/spaces/'+space.id+'/explore',{method:'POST',body:JSON.stringify({scenarios:scenarioPayload(scenarios),scenarioId:selectedScenarioId})});
    await watchExploration(job);
  }catch(error){toast(error.message);}
  finally{busy=false;renderDecisionViews();}
}
async function watchExploration(initial){
  const generation=++watchGeneration;
  activeJobId=initial.id;busy=true;explorationJob=initial;
  if(space?.id!==initial.parentId)await load(await api('/api/spaces/'+initial.parentId));
  scenarios=initial.scenarios;
  selectedScenarioId=initial.scenarioId;
  settings=structuredClone(scenarios.find(s=>s.id===selectedScenarioId).settings);
  controls();render();
  history.replaceState(null,'','#job-'+initial.id);
  try{
    while(generation===watchGeneration){
      const job=await api('/api/jobs/'+initial.id);
      if(generation!==watchGeneration)return;
      explorationJob=job;renderDecisionViews();
      if(job.status==='complete'){
        explorationJob=null;
        await load(await api('/api/spaces/'+job.spaceId));
        toast('分支研究已保存，可切回原始条件比较。');break;
      }
      if(['failed','interrupted'].includes(job.status)){toast(job.error);break;}
      await new Promise(r=>setTimeout(r,1000));
    }
  }catch(error){
    explorationJob={...explorationJob,status:'interrupted',error:'连接中断，服务可能仍在研究。点击继续会重新连接。'};
    toast(error.message);
  }finally{
    if(generation===watchGeneration){busy=false;renderDecisionViews();}
  }
}
async function watchJob(id,{inline=false}={}) {
  const initial=await api("/api/jobs/"+id);
  const focusedOrigin=inline&&initial.researchFocus?{spaceId:universalRoot.dataset.displaySpace,scenarioId:universalRoot.dataset.activeScenario}:null;
  if(initial.type==='scenario'){
    const parent=await api('/api/spaces/'+initial.parentId);
    if(!parent.schema)return watchExploration(initial);
  }
  if (!modernBackend) {
    toast("请先重启旧版本服务以加载持久化任务功能。");
    return;
  }
  const generation = ++watchGeneration;
  activeJobId = id;
  busy = true;
  $("research-button").disabled = true;
  if(!inline){show("job-panel");history.replaceState(null, "", "#job-" + id);}
  else{const input=universalRoot.querySelector('#conversation-message');if(input){input.disabled=true;const send=input.form.querySelector('button[type=submit]');if(send){send.disabled=true;send.textContent='正在核对资料…';}}}
  $("job-error").hidden = true;
  $("resume-job").hidden = true;
  $("reconnect-job").hidden = true;
  try {
    while (generation === watchGeneration) {
      const job = await api("/api/jobs/" + id);
      if (generation !== watchGeneration) return;
      $("job-title").textContent = ["failed", "interrupted"].includes(
        job.status,
      )
        ? "任务已暂停，进度已保留"
        : job.type === "refresh"
          ? "正在检查来源变化"
          : "正在寻找有依据的答案";
      $("job-events").innerHTML =
        job.events
          .map(
            (e) =>
              `<li><b>${escape({ search: "搜索", thinking: "规划", repair: "修复", verification: "核验", refresh: "刷新", observation: "观察", complete: "完成", node: "初始化" }[e.type] || "研究")}</b> ${escape(e.message)}</li>`,
          )
          .join("") || "<li>等待开始执行…</li>";
      const phase=job.events.at(-1)?.node;
      jobActivity.querySelector('p').textContent=['failed','interrupted'].includes(job.status)?'这轮研究暂停了，进度已经保留。':phase==='search'?'我在寻找符合需求的具体方案。':phase==='extract'?'我在整理方案和原文依据。':phase==='verify'?'我在核对配置，排除不一致的信息。':'我在确定需要查找的资料。';
      jobActivity.classList.toggle('is-active',job.status==='running');
      if (job.status === "complete") {
        const result=await api("/api/spaces/" + job.spaceId);
        if(focusedOrigin&&(universalRoot.dataset.displaySpace!==focusedOrigin.spaceId||universalRoot.closest('[hidden]'))){await refreshSidebar();toast('依据核对已完成，结果保存在原来的决策空间。');}
        else{
          const active=universalRoot.dataset.activeScenario;
          if(focusedOrigin&&active!==focusedOrigin.scenarioId){const selected=result.scenarios?.find(s=>s.id===active);if(selected){result.activeScenarioId=active;result.settings=structuredClone(selected.settings);}}
          await load(result);
        }
        break;
      }
      if (["failed", "interrupted"].includes(job.status)) {
        $("job-error").textContent = job.error;
        $("job-error").hidden = false;
        $("resume-job").hidden = false;
        if(inline)toast('这轮研究已暂停，进度保存在「研究任务」中，可继续。');
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (error) {
    $("job-error").textContent = "连接暂时不可用：" + error.message;
    $("job-error").hidden = false;
    $("reconnect-job").hidden = false;
    if(inline)toast('研究连接中断，可从「研究任务」重新连接。');
  } finally {
    if (generation === watchGeneration) {
      busy = false;
      $("research-button").disabled = false;
      if(inline){const input=universalRoot.querySelector('#conversation-message');if(input){input.disabled=false;const send=input.form.querySelector('button[type=submit]');if(send){send.disabled=false;send.textContent='发送 ↑';}}}
    }
  }
}
try {
  const health = await api("/api/health");
  modernBackend = health.agent?.checkpointStorage === "sqlite";
  supplementBackend=(health.agent?.graphVersion||0)>=2;
  scenarioBackend=!!health.capabilities?.scenarioResearch;
  if (modernBackend && !supplementBackend) {
    $("server-notice").hidden = false;
    $("server-notice").textContent = "画布内图文与补充检索已更新。请在原终端按 Ctrl+C，再执行 npm start，加载 0.4 后台。旧研究快照不会被自动改写。";
  }
  if (!modernBackend) {
    $("server-notice").hidden = false;
    $("server-notice").textContent =
      "检测到旧版本后台仍在运行。请在原终端按 Ctrl+C 后重新运行 npm start，以加载 0.2 更新；已有空间和演示仍可查看。";
    for (const id of [
      "jobs-button",
      "manage-candidates",
      "refresh-button",
      "research-button",
      "settings-button",
      "live-status",
    ])
      $(id).disabled = true;
  }
  $("agent-status").textContent = health.agent
    ? "从你的问题开始，找到有依据的选择。"
    : "研究服务需要重启以加载 LangGraph 更新";
  updateConnection({
    ready: health.live,
    searchProvider: health.searchProvider,
  });
  await refreshSidebar();
  const id = location.hash.slice(1);
  if (/^job-[a-f0-9-]{36}$/.test(id)) await watchJob(id.slice(4));
  else if (/^[a-f0-9-]{36}$/.test(id))
    await load(await api("/api/spaces/" + id));
} catch (error) {
  toast(error.message);
  $("live-status").textContent = "服务连接异常";
}

$('question').addEventListener('input',()=>{$('question-domain').textContent='助手会根据你的目标整理比较方式';});
$('housing-demo-button').onclick=async()=>{try{await load(await api('/api/spaces/demo/housing',{method:'POST'}));}catch(e){toast(e.message);}};
