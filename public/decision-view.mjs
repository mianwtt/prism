import { evaluate, dimensions, factIssue } from "/engine.mjs";
import { scenarioAnalysis, analyzeScenario, scenarioCandidates, scenarioSettingsKey } from "/scenarios.mjs";
const e = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const number = value => Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const summary = s => `预算 ¥${number(s.budget)} · 内存 ≥${s.minMemory}GB · 重量 ≤${s.maxWeight}kg`;
const status = r => r.status === "eligible" ? r.score.toFixed(1) + " 分" : ({ excluded: "不满足约束", unresolved: "证据不足", disabled: "已暂停" })[r.status];
const link = source => {
  const url = /^https?:\/\//.test(source.url || "") ? source.url : null;
  return url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(source.title)} ↗</a>` : e(source.title);
};
const sourceStatus = source => source.kind==="search-excerpt" ? "仅搜索摘要，正文未取得" : source.readStatus==="failed" ? "正文补读失败，保留旧文本" : "已保存网页文本";
const domain = source => { try { return new URL(source.url).hostname; } catch { return "来源站点未记录"; } };
function sourcePreview(source){
  const text=String(source.text||'');
  const hit=text.search(/CPU型号|处理器|内存容量|硬盘容量|操作系统|屏幕分辨率|机身重量|规格参数/i);
  const start=hit<0?0:Math.max(0,hit-20);
  return text.slice(start,start+600);
}
function mediaFor(space, candidate) {
  const source = space.sources.find(s => s.id === candidate?.media?.sourceId);
  if(source?.image?.url && source.image.url === candidate?.media?.url && /^https:\/\//.test(source.image.url))return { ...candidate.media, source };
  // Older snapshots may have a saved merchant image without candidate.media.
  // Only use a supporting source whose title identifies the same model family.
  const clean=value=>String(value||"").toLowerCase().replace(/\s+/g,"");
  const model=clean(candidate?.name).match(/(?:matebook|vivobook|thinkbook|thinkpad|星book|无畏|蛟龙|macbook(?:air|pro)?)[a-z]*\d+/i)?.[0];
  if(!model)return null;
  const ids=new Set(Object.entries(candidate.facts).flatMap(([key,f])=>[f,...(f.evidence||[])].filter(item=>!factIssue(key,item)).map(item=>item.sourceId)).filter(Boolean));
  const fallback=space.sources.find(s=>ids.has(s.id)&&clean(s.title).includes(model)&&/^https:\/\//.test(s.image?.url||""));
  return fallback?{...fallback.image,source:fallback,sourceId:fallback.id}:null;
}
function canonicalProductView(space,candidate,rank,winner,selected){
 const p=candidate.productData,media=mediaFor(space,candidate),analysis=analyzeScenario(space,selected);
 const change=analysis.rows.find(r=>r.id===candidate.id);
 const price=candidate.facts.price,goodPrice=!factIssue('price',price);
 const badge=rank.id===winner?.id?'当前情景首选':rank.status==='eligible'?'可比较':rank.status==='excluded'?rank.reasons.join(' · '):'计算依据需确认';
 const core=(key,label)=>`<button type="button" class="product-fact" data-candidate="${e(candidate.id)}" data-fact="${key}" aria-label="查看 ${e(candidate.name)} 的${dimensions[key].label}证据"><span>${label}</span><b>${e(candidate.facts[key].value)}${e(dimensions[key].unit)}</b></button>`;
 return `<article class="canvas-product product-canonical ${rank.id===winner?.id?'product-winner':''} ${rank.status==='excluded'?'product-excluded':''}" data-product-id="${e(candidate.id)}"><div class="product-card-top"><span class="product-state">${e(badge)}</span>${candidate.discoveredInScenario===selected.id?'<span class="product-change">本分支新发现</span>':change?.entered?'<span class="product-change">新进入</span>':change?.exited?'<span class="product-change exited">已退出</span>':rank.status==='eligible'?`<span class="product-score">${rank.score.toFixed(1)}<small> / 100</small></span>`:''}</div><div class="product-image">${media?`<img src="${e(media.url)}" alt="${e(candidate.name)} 来源商品配图" loading="lazy" referrerpolicy="no-referrer"><span class="image-placeholder" hidden>来源图片暂不可用</span>`:'<span class="image-placeholder">商品页未提供配图</span>'}</div><div class="product-detail"><div class="product-model-line"><span>${e(p.fields.os.value)}</span><span>商品 ${e(p.identity.platformProductId)}</span></div><h4>${e(candidate.name)}</h4><p class="product-cpu">${e(p.fields.cpu.value)} <span>· ${e(p.fields.screenResolution.value)}</span></p><button class="product-price" type="button" data-candidate="${e(candidate.id)}" data-fact="price" aria-label="查看 ${e(candidate.name)} 的价格证据"><span>${price.confirmation==='user-assumption'?'个人假设价格':'公开页面标价'}</span><strong>${goodPrice?'¥'+number(price.value):'价格引用需重新核对'}</strong><small>点击查看报价原文 ↗</small></button><div class="product-facts">${core('memory','内存')}<button type="button" class="product-fact" data-detail-candidate="${e(candidate.id)}" data-detail-key="storageGB"><span>固态硬盘</span><b>${e(p.fields.storageGB.value)}GB</b></button>${core('weight','净重')}</div><div class="product-verdict"><span>${rank.status==='eligible'?'✓':rank.status==='excluded'?'−':'○'}</span><p>${e(rank.status==='eligible'?`满足当前预算与重量限制${selected.settings.calculationMode==='provisional'?' · 页面引用试算':''}`:[...rank.reasons,...rank.unknown].join('；'))}</p></div><details class="product-spec-details"><summary>展开配置与原文依据</summary><dl>${Object.entries(p.fields).filter(([key])=>!['priceCNY','memoryGB','weightKg'].includes(key)).map(([key,f])=>`<div><dt>${e(({cpu:'处理器',storageGB:'硬盘 / GB',os:'操作系统',screenResolution:'屏幕分辨率'})[key]||key)}</dt><dd><button type="button" data-detail-candidate="${e(candidate.id)}" data-detail-key="${e(key)}">${e(f.value)} ↗</button></dd></div>`).join('')}</dl><p>当前规格原文未披露续航小时，未纳入评分。</p></details><div class="product-source-summary"><span><i class="source-dot"></i>${e(candidate.seller||'商品来源页')}</span><span>页面标价 · ${e(new Date(p.sources.find(s=>s.id===p.fields.priceCNY.sourceId)?.retrievedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}))} 采集</span></div><div class="product-card-actions"><button type="button" data-product-sources="${e(candidate.id)}">来源与参数对照 ↗</button><a href="${e(p.sourceProductUrl)}" target="_blank" rel="noopener noreferrer">打开商品页 ↗</a></div></div></article>`;
}
export function decisionSummaryView(space,selected){
 const analysis=analyzeScenario(space,selected),winner=analysis.after.find(r=>r.status==='eligible');
 const current=space.candidates.find(c=>c.id===winner?.id),before=analysis.before.find(r=>r.status==='eligible');
 const valid=scenarioCandidates(space,selected).filter(c=>!factIssue('price',c.facts.price)&&!factIssue('weight',c.facts.weight));
 const light=[...valid].sort((a,b)=>a.facts.weight.value-b.facts.weight.value)[0],cheap=[...valid].sort((a,b)=>a.facts.price.value-b.facts.price.value)[0];
 const tradeoff=light&&cheap&&light.id!==cheap.id?`${light.name} 更轻 ${number((cheap.facts.weight.value-light.facts.weight.value)*1000)}g；${cheap.name} 少花 ¥${number(light.facts.price.value-cheap.facts.price.value)}。`:'';
 const isCanonical=space.candidates.every(c=>c.productData);
 const minPrice=valid.length?Math.min(...valid.map(c=>c.facts.price.value)):null;
 return `<section class="decision-summary ${analysis.diff.changed?'decision-flipped':''}" aria-live="polite"><div class="decision-summary-main"><span class="eyebrow">${analysis.diff.changed?'DECISION FLIP / 首选发生变化':winner?'YOUR CURRENT CHOICE / 当前情景':'CONSTRAINT CHECK / 条件检查'}</span><h3>${analysis.diff.changed?`<span class="previous-choice">${e(before?.name||'暂无匹配')}</span><span class="decision-arrow">→</span>${e(winner?.name||'暂无匹配')}`:winner?e(winner.name)+'，在当前偏好下优先':analysis.after.every(r=>r.status==='excluded')?'当前条件下，没有匹配的方案':'先核对依据，再比较选择'}</h3><p>${e(tradeoff||winner?'':analysis.after.flatMap(r=>r.reasons).filter((v,i,a)=>a.indexOf(v)===i).join('；'))}${e(tradeoff)}</p><div class="decision-change-line">${analysis.changes.length?analysis.changes.map(c=>`<span>${e(c.label)} <s>${e(c.before)}</s> → <b>${e(c.after)} ${e(c.unit)}</b></span>`).join(''):'<span>试试收紧预算或调整重量上限，观察哪款方案进入或退出。</span>'}</div></div><div class="decision-summary-aside"><span class="decision-mode">${selected.settings.calculationMode==='provisional'?'页面引用试算':'已确认参数计算'}</span><strong>${analysis.after.filter(r=>r.status==='eligible').length}<small> / ${scenarioCandidates(space,selected).length}</small></strong><span>方案满足当前条件</span>${!winner&&minPrice&&selected.settings.budget<minPrice?`<button type="button" data-budget="${minPrice}">预算调至 ¥${number(minPrice)} →</button>`:isCanonical?'<span class="evidence-scope">当前 1 个购物平台<br>尚未跨平台核对</span>':''}</div></section>`;
}
export function explorationView(space,selected,job=null,focusedId=null,originSettings=null){
  const analysis=analyzeScenario(space,selected),base=analysis.before.find(r=>r.status==='eligible'),current=analysis.after.find(r=>r.status==='eligible');
  const inspecting=analysis.after.find(r=>r.id===focusedId&&r.status==='eligible');
  const original=space.candidates.find(c=>c.id===base?.id),chosen=space.candidates.find(c=>c.id===(inspecting?.id||current?.id));
  const research=selected.research,stale=research&&(research.settings?scenarioSettingsKey(research.settings):research.settingsKey)!==scenarioSettingsKey(selected.settings);
  const running=job?.status==='running',failed=job&&['failed','interrupted'].includes(job.status),events=job?.events||research?.events||[];
  const stage=events.at(-1)?.node;
  const action=running?(stage==='discover'?'我在逛商品目录，寻找更多具体选择。':stage==='search'?'我在找符合新条件的商品。':stage==='extract'?'我在读取商品配置和报价。':stage==='verify'?'我在核对价格和配置。':'我在确定这次需要补查什么。'):failed?'这轮研究暂停了，可以继续。':stale?'条件变了，我可以按新范围继续找。':research?(research.addedIds.length?`这次找到了 ${research.addedIds.length} 个资料完整的新方案。`:'这轮还没找到资料完整的新方案。'):'想换个条件？我可以继续为你找。';
  const photo=c=>{const m=c&&mediaFor(space,c);return m?`<img src="${e(m.url)}" alt="${e(c.name)} 商品来源配图" referrerpolicy="no-referrer">`:'<span class="canvas-photo-empty">等待商品资料</span>';};
  const price=c=>c&&!factIssue('price',c.facts.price)?'¥'+number(c.facts.price.value):'尚无可比较报价';
  const changed=original?.id!==chosen?.id;
  const outcome=inspecting?'你正在查看这个方案。':changed?chosen?'选择变了。':'这个条件下，暂时没有合适的选择。':chosen?'选择暂时没变。':'先找一个有依据的选择。';
  let difference='';
  if(original&&chosen&&original.id!==chosen.id){
    const saving=original.facts.price.value-chosen.facts.price.value,grams=Math.round((original.facts.weight.value-chosen.facts.weight.value)*1000);
    difference=[saving?`${saving>0?'少花':'多花'} ¥${number(Math.abs(saving))}`:'',grams?`${grams>0?'更轻':'更重'} ${Math.abs(grams)}g`:''].filter(Boolean).join(' · ');
  }
  const state=running?'正在研究':failed?'研究暂停':stale?'条件已变':research?'本轮研究完成':space.mode==='demo'?'演示 · 虚构方案':'准备就绪';
  const explanation=difference||((research&&!stale)?'这是当前已取得证据的结果。换个条件，或让我继续找。':'先看已有方案的变化；新方案需要继续研究。');
  const origin=originSettings||research?.settings||space.scenarios?.find(s=>s.id===selected.parentScenarioId)?.settings||space.baselineSettings||space.settings;
  const liveChange=scenarioAnalysis(scenarioCandidates(space,selected),origin,selected.settings);
  const exited=liveChange.rows.filter(r=>r.exited),entered=liveChange.rows.filter(r=>r.entered);
  const changedConditions=scenarioSettingsKey(origin)!==scenarioSettingsKey(selected.settings);
  const question=changedConditions?`如果${liveChange.changes.filter(c=>['预算','最低内存','重量上限'].includes(c.label)).map(c=>`${c.label}改为 ${c.after}${c.unit}`).join('，')}？`:selected.name==='原始条件'?'现在这样选。如果条件变了呢？':selected.name+(/[？?]$/.test(selected.name)?'':'？');
  return `<section class="exploration agent-canvas ${running?'agent-working':''}" aria-label="What-if 决策路径">
    <div class="agent-presence path-agent"><span class="agent-orb" aria-hidden="true">✦</span><div><span class="agent-name">Prism <span>研究助手</span></span><p role="status">${e(action)}</p></div><span class="exploration-state">${e(state)}</span><button type="button" data-explore-scenario ${running?'disabled':''}>${running?'正在探索…':failed?'继续研究':research?'继续找新方案':'探索更多方案'} ↗</button></div>
    <div class="canvas-question"><span class="eyebrow">WHAT IF</span><h3>${e(question)}</h3></div>
    ${quickConditionsView(selected.settings,running)}
    ${changedConditions?`<p class="condition-reaction" role="status">按新条件，${liveChange.after.filter(r=>r.status==='eligible').length} 个方案可选${exited.length?` · ${exited.length} 个退出`:''}${entered.length?` · ${entered.length} 个新进入`:''}</p>`:''}
    <div class="choice-journey"><article class="choice-origin"><span class="journey-label">原来的选择</span><div class="journey-photo">${photo(original)}</div><strong>${e(original?.name||'还没有首选')}</strong><span class="journey-price">${e(price(original))}</span></article>
    <div class="choice-fork"><span class="fork-dot"></span><div class="fork-condition">${analysis.changes.length?analysis.changes.map(c=>`<span>${e(c.label)}<b>${e(c.before)} → ${e(c.after)} ${e(c.unit)}</b></span>`).join(''):'<span>从这里分叉<b>试试预算、内存或重量</b></span>'}</div><span class="fork-arrow">↗</span></div>
    <article class="choice-destination ${changed?'choice-changed':''}"><span class="journey-label">${inspecting?'你正在查看':changed?'这个情景的新选择':'这个情景的选择'}</span><div class="journey-photo">${photo(chosen)}</div><strong>${e(chosen?.name||'暂时没有匹配方案')}</strong>${chosen?`<button type="button" class="journey-price" data-candidate="${e(chosen.id)}" data-fact="price" aria-label="查看 ${e(chosen.name)} 的价格证据">${e(price(chosen))} <small>${chosen.facts.price.confirmation==='user-assumption'?'个人假设':'↗'}</small></button>`:`<span class="journey-price">${e(price(chosen))}</span>`}<span class="journey-difference">${e(difference||outcome)}</span></article></div>
    ${choiceOptionsView(space,selected,chosen?.id,current?.id,exited)}
    <div class="journey-takeaway"><span>${analysis.diff.changed?'↗':'↔'}</span><div><strong>${e(outcome)}</strong><p>${e(explanation)}</p></div></div>
    <details class="exploration-log"><summary>查看 Agent 执行过程</summary>${events.length?`<ol>${events.map(event=>`<li><span>${e(({search:'搜索',thinking:'规划',verification:'核对',price:'报价',complete:'完成',observation:'读取'})[event.type]||'研究')}</span>${e(event.message)}</li>`).join('')}</ol>`:'<p>尚未执行新检索。改变条件可以先在已有方案中推演。</p>'}${failed?`<p role="alert">${e(job.error)}</p>`:''}${research?.rejected?.length?`<details class="exploration-rejected"><summary>未采纳的线索</summary><ul>${research.rejected.map(d=>`<li>${e(d.name)}：${e(d.reason)}</li>`).join('')}</ul></details>`:''}${space.mode==='demo'?'<p>当前为虚构数据演示，没有调用联网研究。</p>':''}</details></section>`;
}
function quickConditionsView(settings,busy){
 const options=(values,current,unit)=>[...new Set([...values,current])].sort((a,b)=>a-b).map(v=>`<option value="${v}" ${v===current?'selected':''}>${v}${unit}</option>`).join('');
 return `<div class="whatif-tweaks" aria-label="直接试调当前情景"><div class="quick-budget"><span>预算</span><button type="button" data-nudge-budget="-1000" aria-label="预算减少 1000 元" ${busy||settings.budget<=0?'disabled':''}>−</button><output>¥${number(settings.budget)}</output><button type="button" data-nudge-budget="1000" aria-label="预算增加 1000 元" ${busy||settings.budget>=1000000?'disabled':''}>＋</button></div><label>内存 ≥<select data-quick-condition="minMemory" aria-label="快速调整最低内存" ${busy?'disabled':''}>${options([8,16,24,32,64],settings.minMemory,'GB')}</select></label><label>重量 ≤<select data-quick-condition="maxWeight" aria-label="快速调整重量上限" ${busy?'disabled':''}>${options([1.3,1.5,1.7,2,2.5],settings.maxWeight,'kg')}</select></label></div>`;
}
function choiceOptionsView(space,selected,focusedId,winnerId,exited=[]){
 const all=evaluate(scenarioCandidates(space,selected),selected.settings),ranks=all.filter(r=>r.status==='eligible'),blocked=all.filter(r=>r.status==='excluded');
 if(all.length<2)return '';
 const exitedIds=new Set(exited.map(r=>r.id));
 return `<section class="choice-options" aria-label="其他符合条件的选择"><div><span>${ranks.length?'还有这些选择':'当前条件下暂无匹配方案'}</span><small>${ranks.length} 个符合条件${ranks.length?' · 点一个，放到画布上':''}</small>${ranks.length>3?'<button type="button" data-scroll-choices aria-label="查看更多选择">→</button>':''}</div><div class="choice-options-list">${ranks.map(r=>{
  const c=space.candidates.find(c=>c.id===r.id),media=mediaFor(space,c);
  return `<button type="button" class="choice-option ${c.id===focusedId?'is-focused':''}" data-focus-candidate="${e(c.id)}" aria-pressed="${c.id===focusedId}">${media?`<img src="${e(media.url)}" alt="${e(c.name)}" referrerpolicy="no-referrer" loading="lazy">`:'<span class="option-no-image">商品页未提供配图</span>'}<strong>${e(c.name)}</strong><b>¥${number(c.facts.price.value)}</b><small>${e(c.facts.memory.value)}GB · ${e(c.facts.weight.value)}kg${c.id===winnerId?' · 当前偏好首选':''}</small></button>`;
 }).join('')}</div>${blocked.length?`<details class="condition-exits"><summary>${blocked.length} 个方案不符合当前条件，看看原因</summary><ul>${blocked.map(r=>`<li><strong>${e(r.name)}</strong><span>${exitedIds.has(r.id)?'本次退出 · ':''}${e(r.reasons.join('、'))}</span></li>`).join('')}</ul></details>`:''}</section>`;
}

export function specificationComparisonView(space){
 if(!space.candidates.every(c=>c.productData))return '';
 const rows=[['priceCNY','页面标价','元','price'],['cpu','处理器','',''],['memoryGB','内存','GB','memory'],['storageGB','固态硬盘','GB',''],['weightKg','净重','kg','weight'],['os','操作系统','',''],['screenResolution','屏幕分辨率','','']];
 return `<section class="specification-comparison"><div class="section-heading"><div><span class="eyebrow">SIDE BY SIDE / 参数并列对照</span><h2>取舍之前，先把事实放在一起。</h2></div><span>点击数值查看保存的原文</span></div><div class="table-wrap"><table><thead><tr><th>对照项</th>${space.candidates.map(c=>`<th>${e(c.name)}<small>${e(c.seller)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([key,label,unit,core])=>`<tr><th>${label}</th>${space.candidates.map(c=>`<td><button type="button" ${core?`data-candidate="${e(c.id)}" data-fact="${core}"`:`data-detail-candidate="${e(c.id)}" data-detail-key="${key}"`}>${e(core?c.facts[core].value:c.productData.fields[key].value)} ${unit}<span> ↗</span></button></td>`).join('')}</tr>`).join('')}</tbody></table></div><p>报价来自不同店铺的商品页。当前均为苏宁平台，尚未形成跨平台核对；CPU与屏幕作资料对照，当前评分使用价格、内存与重量。</p></section>`;
}
export function productView(space, selected) {
  if(space.comparisonData&&!space.comparisonData.comparisonReady?.length)return `<section class="collection-incomplete"><span class="eyebrow">RESEARCH DRAFT / 采集草稿</span><h3>先把证据收齐，再开始比较。</h3><p>本轮尚未形成核心字段齐全的方案。草稿已保留，可继续补充检索；不会用缺少依据的卡片生成排名。</p><ul>${(space.comparisonData.researchDrafts||[]).map(p=>`<li><strong>${e(p.name)}</strong><span>${e(p.blockers.map(k=>({'missing:priceCNY':'未取得页面价格','missing:cpu':'处理器未对齐','missing:memoryGB':'内存未对齐','missing:storageGB':'硬盘未对齐','missing:weightKg':'重量未取得','missing:os':'操作系统未取得','missing:screenResolution':'屏幕参数未取得'}[k]||k)).join(' · '))}</span></li>`).join('')}</ul><button type="button" data-view-research>查看采集记录 →</button></section>`;
  const rankings=evaluate(scenarioCandidates(space,selected),selected.settings), winner=rankings.find(r=>r.status==="eligible");
  const analysis=analyzeScenario(space,selected);
  return `<div class="canvas-products">${rankings.map(rank=>{
    const candidate=space.candidates.find(c=>c.id===rank.id), media=mediaFor(space,candidate);
    if(candidate.productData)return canonicalProductView(space,candidate,rank,winner,selected);
    const label=space.mode!=="demo" && !candidate.originalName ? candidate.name.replace(/\s*[(（][^()（）]*[)）]/g,"").trim()||candidate.name : candidate.name;
    const gaps=Object.entries(dimensions).filter(([key])=>!!factIssue(key,candidate.facts[key])).map(([,d])=>d.label);
    const cited=Object.entries(candidate.facts).filter(([key,f])=>f.status==="unreviewed"&&!factIssue(key,f)).length;
    const prices=(candidate.priceObservations||[]).filter(p=>p.kind==='aggregator-reference'&&Number.isFinite(p.value)&&p.value>=1000&&p.value<=100000&&space.sources.some(s=>s.id===p.sourceId&&s.text?.includes(p.quote)));
    const priceValues=[...new Set(prices.map(p=>p.value))].sort((a,b)=>a-b);
    const referenceDisplay=priceValues.length>1?`¥${number(priceValues[0])}–${number(priceValues.at(-1))}`:priceValues.length?`¥${number(priceValues[0])}`:'';
    const reason=rank.reasons.length?rank.reasons.join("、"):gaps.length?"待补充："+gaps.join("、"):cited?`${cited} 项引用尚未人工核对`:"满足当前条件";
    const change=analysis.rows.find(r=>r.id===rank.id);
    const sourceIds=new Set(Object.values(candidate.facts).flatMap(f=>[f,...(f.evidence||[]),...(f.conflictingEvidence||[])]).map(f=>f.sourceId).filter(Boolean));
    const sources=space.sources.filter(s=>sourceIds.has(s.id));
    const domains=[...new Set(sources.map(domain))];
    const excerpts=sources.filter(s=>s.kind!=="search-excerpt"&&s.text).slice(0,2);
    const previews=(prices.length?`<details class="price-references"><summary>查看参考报价 · 未用于预算排名</summary>${prices.map(p=>{const s=space.sources.find(s=>s.id===p.sourceId);return `<section><b>¥${number(p.value)} · 平台参考</b><p>${e(p.configuration)}</p><blockquote>${e(p.quote)}</blockquote>${link(s)}<small>读取于 ${e(new Date(p.retrievedAt).toLocaleString('zh-CN'))} · 未核实库存、优惠资格及结算价</small></section>`}).join('')}</details>`:'')+(excerpts.length?`<details class="product-source-preview"><summary>已抓取的配置资料 · ${excerpts.length} 份正文</summary><p>以下为来源原文片段，未自动确认为当前配置。</p>${excerpts.map(s=>`<section><strong>${link(s)}</strong><blockquote>${e(sourcePreview(s))}</blockquote></section>`).join('')}</details>`:"");
    const device=`<svg class="device-outline" viewBox="0 0 240 150" fill="none" aria-hidden="true"><rect x="38" y="16" width="164" height="108" rx="8"/><rect x="46" y="24" width="148" height="91" rx="3"/><path d="M38 124 18 137h204l-20-13M98 137h44"/></svg>`;
    return `<article class="canvas-product ${rank.id===winner?.id?"product-winner":""} ${rank.status==="excluded"?"product-excluded":""}" data-product-id="${e(candidate.id)}"><div class="product-card-top"><span class="product-state">${rank.id===winner?.id?(selected.settings.calculationMode==="provisional"?"试算首选":"当前首选"):status(rank)}</span>${candidate.discoveredInScenario===selected.id?'<span class="product-change">本分支新发现</span>':change?.entered?'<span class="product-change">新进入</span>':change?.exited?'<span class="product-change exited">已退出</span>':rank.status==="eligible"?`<span class="product-score">${rank.score.toFixed(1)}<small> / 100</small></span>`:""}</div><div class="product-image ${media?"":"missing-image"}">${media?`<img src="${e(media.url)}" alt="${e(label)} 来源页面配图，具体配置待核实" loading="lazy" referrerpolicy="no-referrer"/><span class="image-placeholder" hidden>来源图片暂不可用</span>`:`${device}<span class="image-placeholder">${space.mode==="demo"?"虚构方案 · 外观示意":"暂无来源配图"}</span>`}</div><div class="product-detail"><h4>${e(label)}</h4><div class="product-facts">${Object.entries(dimensions).map(([key,d])=>{
      const fact=candidate.facts[key],issue=factIssue(key,fact);
      const reference=key==='price'&&issue&&referenceDisplay;
      const listed=key==='price'&&fact.priceKind==='merchant-listed';
      return `<button type="button" class="product-fact ${issue?"fact-missing":""} ${reference?'has-reference-price':''}" data-candidate="${e(candidate.id)}" data-fact="${key}" aria-label="查看 ${e(candidate.name)} 的${d.label}证据" title="${e(reference?'平台参考报价，未经商家核实，不参与排名':issue|| (fact.status==="confirmed"?"已确认":"有原文引用，尚未核对"))}"><span>${d.label}${listed?' · 页面标价':reference?' · 平台参考':''}</span><b>${reference?referenceDisplay:issue?"待补充":(key==="price"?"¥":"")+e(fact.value)+(key==="price"?"":d.unit)}</b>${listed?`<small>${fact.availability==='out-of-stock'?'页面显示缺货 · 不影响信息比较':'已记录来源'}</small>`:reference?`<small>${priceValues.length>1?'多配置区间':'非当前成交价'}</small>`:fact.confirmation==="user-assumption"?"<small>个人假设</small>":fact.status==="unreviewed"&&!issue?"<small>有引用</small>":""}</button>`;
    }).join("")}</div><p class="product-reason" title="${e([...rank.reasons,...rank.unknown].join("；"))}">${e(reason)}</p>${previews}<div class="product-source-summary"><span>${space.mode==="demo"?"合成演示资料":`${sources.length} 份关联资料`}</span><span title="${e(domains.join(" · "))}">${space.mode==="demo"?"非真实商品":domains.slice(0,2).map(e).join(" · ")||"等待参数来源"}</span></div><div class="product-card-actions"><button type="button" data-product-sources="${e(candidate.id)}">参数与多源对照 ↗</button>${media?`<a href="${e(media.pageUrl||media.source.url)}" target="_blank" rel="noopener noreferrer">来源配图 ↗</a>`:""}</div>${media?'<small class="media-caption">系列配图 · 具体配置待核实</small>':""}</div></article>`;
  }).join("")}</div>`;
}

export function canvasView(space, branches, selectedId) {
  const baselineWinner = evaluate(scenarioCandidates(space,{candidateIds:space.baselineCandidateIds}), space.baselineSettings||space.settings).find(r => r.status === "eligible");
  const rows=branches.map((branch,index)=>({branch,selected:branch.id===selectedId,y:20+index*152}));
  const height=branches.length*152+28, baselineY=height/2-65;
  const paths=[], nodes=[];
  for(const [index,{branch,selected,y}] of rows.entries()) {
    const analysis=analyzeScenario(space,branch), winner=analysis.after.find(r=>r.status==="eligible");
    const center=y+54, branchY=y;
    paths.push(`<path d="M 180 ${baselineY+65} C 205 ${baselineY+65}, 205 ${center}, 240 ${center}" class="${selected?"selected-edge":""}"/><path d="M 440 ${center} L 500 ${center}" class="${winner?"result-edge":"blocked-edge"}"/>`);
    nodes.push(`<button type="button" class="scenario-node branch-node ${selected?"selected":""}" data-x="240" data-y="${branchY}" data-select-scenario="${e(branch.id)}" aria-pressed="${selected}"><span class="node-type">${String(index+1).padStart(2,"0")} / 如果</span><strong>${e(branch.name)}</strong><span>预算 ¥${number(branch.settings.budget)}</span><span>内存 ≥${branch.settings.minMemory} GB · 重量 ≤${branch.settings.maxWeight} kg</span><small>${analysis.changes.length?analysis.changes.length+" 项条件变化":"与基准相同"}${selected?" · 当前情景":" · 点击切换"}</small></button>`);
    nodes.push(`<button type="button" class="scenario-node outcome-node compact-outcome ${selected?"selected":""} ${winner?"has-winner":"blocked"}" data-x="500" data-y="${y}" data-select-scenario="${e(branch.id)}"><span class="node-type">那么 / ${selected?"正在查看":"查看图文方案"}</span><strong>${winner?e(winner.name):"尚不能确定首选"}</strong><span>${winner?winner.score.toFixed(1)+" 分 · "+(analysis.diff.changed?"首选改变":"首选不变"):"缺少可用于排名的参数"}</span><small>${analysis.diff.entered.length} 个进入 · ${analysis.diff.exited.length} 个退出</small></button>`);
  }
  const selected=branches.find(b=>b.id===selectedId)||branches[0];
  const analysis=analyzeScenario(space,selected);
  return {width:860,height,products:`<section class="scenario-results" data-current-scenario="${e(selected.id)}"><div class="results-heading"><div><span class="eyebrow">${space.mode==="demo"?"DEMO / 虚构数据演示":"SCENARIO / 当前情景"}</span><h3>${e(selected.name)}</h3><p>${e(summary(selected.settings))}</p></div><div class="results-count"><b>${analysis.after.filter(r=>r.status==="eligible").length}<span> / ${scenarioCandidates(space,selected).length}</span></b><small>方案满足比较条件</small></div></div>${productView(space,selected)}</section>`,html:`<svg class="scenario-edges" width="860" height="${height}" aria-hidden="true"><defs><marker id="flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#91a09b"/></marker></defs>${paths.join("")}</svg><div class="scenario-node baseline-node" data-x="20" data-y="${baselineY}"><span class="node-type">基准 / 已保存 v${space.version}</span><strong>原始条件</strong><span>预算 ¥${number((space.baselineSettings||space.settings).budget)}</span><span>内存 ≥${(space.baselineSettings||space.settings).minMemory} GB · 重量 ≤${(space.baselineSettings||space.settings).maxWeight} kg</span><small>首选：${e(baselineWinner?.name||"待补充资料")}</small></div>${nodes.join("")}`};
}

export function impactView(space, selected) {
  const result = analyzeScenario(space,selected);
  const winner = result.after.find(r => r.status === "eligible");
  const pills = result.changes.map(c => `<span class="change-pill">${e(c.label)} ${e(c.before)} → <b>${e(c.after)} ${e(c.unit)}</b></span>`).join("");
  const bars = result.rows.map(row => `<div class="impact-row"><div><strong>${e(row.name)}</strong><small>${row.entered ? "新进入可比较范围" : row.exited ? "退出可比较范围" : row.delta !== null ? `分数变化 ${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)}` : row.after.unknown.join("；") || row.after.reasons.join("；")}</small></div><div class="score-track"><span class="baseline-bar" data-score-width="${row.before.score ?? 0}"></span><span class="scenario-bar" data-score-width="${row.after.score ?? 0}"></span></div><div class="score-values"><span>${status(row.before)}</span><b>→</b><strong>${status(row.after)}</strong></div></div>`).join("");
  return `<div class="impact-heading"><div><span class="eyebrow">BASELINE → ${e(selected.name)}</span><h3>${result.diff.changed ? `首选：${e(result.diff.previous || "暂无")} → ${e(winner?.name || "暂无")}` : winner ? `首选保持 ${e(winner.name)}` : "缺少证据时，结果分支不会生成虚假排名"}</h3></div><span>${result.diff.entered.length} 个进入 / ${result.diff.exited.length} 个退出</span></div><div class="scenario-conditions"><p><b>基准</b>${e(summary(space.baselineSettings||space.settings))}</p><p><b>当前</b>${e(summary(selected.settings))}</p></div><div class="change-pills">${pills || '<span class="muted">尚未改变条件。可点击上方快捷分支或修改右侧条件。</span>'}</div><details class="impact-details"><summary>查看每个方案的得分变化</summary><div class="chart-legend"><span>■ 基准得分</span><span>■ 当前情景得分</span><small>0–100 · 不可排名时不绘制分数条</small></div>${bars}</details>`;
}

export function sourceView(space, candidateId) {
  const candidate = space.candidates.find(c => c.id === candidateId) || space.candidates[0];
  if (!candidate) return { html: "暂无候选方案", summary: "", library: "" };
  if(candidate.productData){
    const labels={priceCNY:'页面标价',cpu:'处理器',memoryGB:'内存',storageGB:'硬盘',weightKg:'净重',os:'操作系统',screenResolution:'屏幕分辨率'};
    const units={priceCNY:'元',memoryGB:'GB',storageGB:'GB',weightKg:'kg'};
    const rows=Object.entries(candidate.productData.fields).map(([key,f])=>{
      const source=space.sources.find(s=>s.id===f.sourceId);
      return `<tr><th>${e(labels[key]||key)}</th><td><strong>${e(f.value)} ${units[key]||''}</strong><small>保存的页面记录</small></td><td><blockquote>${e(f.quote)}</blockquote></td><td>${source?`<a href="${e(source.url)}" title="${e(source.title)}" target="_blank" rel="noopener noreferrer">${e(domain(source))} ↗</a><small>${e(new Date(source.retrievedAt).toLocaleString('zh-CN'))}</small>`:'来源不在当前快照中'}</td></tr>`;
    }).join('');
    const urls=new Set(candidate.productData.sources.map(s=>s.url));
    return {summary:`${candidate.name}：${Object.keys(candidate.productData.fields).length} 项核心字段有原文，来自 ${urls.size} 个具体商品页。价格读取与规格读取是同页的不同采集记录，不能视为独立来源验证。`,
     html:`<table class="canonical-source-table"><thead><tr><th>参数</th><th>采集值</th><th>保存的原文</th><th>来源与采集时间</th></tr></thead><tbody>${rows}</tbody></table>`,
     library:space.sources.map(s=>`<div class="library-source"><span>${e(s.id)}</span><div>${link(s)}<small>${e(sourceStatus(s))} · ${e(new Date(s.retrievedAt).toLocaleString('zh-CN'))}</small></div></div>`).join('')};
  }
  const items = [];
  for (const [key, fact] of Object.entries(candidate.facts)) {
    for (const observation of [fact, ...(fact.evidence || []), ...(fact.conflictingEvidence || []), ...(fact.rejectedEvidence ? [fact.rejectedEvidence] : [])]) {
      if (!observation.sourceId || !observation.quote) continue;
      if (items.some(item => item.key === key && item.sourceId === observation.sourceId && item.quote === observation.quote)) continue;
      items.push({ ...observation, key,
        issue: observation === fact.rejectedEvidence ? fact.reviewReason || "引文未通过校验" : factIssue(key, observation),
        overridden: fact.confirmation === "user-assumption" || (fact.status === "confirmed" && fact.value !== observation.value),
        conflict: !!fact.conflictingEvidence?.some(x => x.sourceId === observation.sourceId && x.value === observation.value) });
    }
  }
  const sources = space.sources.filter(s => items.some(item => item.sourceId === s.id));
  const domains = new Set(sources.filter(s => s.url).map(s => { try { return new URL(s.url).hostname; } catch { return ""; } }).filter(Boolean));
  const rows = sources.map(source => `<tr><td><span class="source-id">${e(source.id)}</span><strong>${link(source)}</strong><small>${source.kind === "fixture" ? "虚构演示资料" : `${e(domain(source))} · ${new Date(source.retrievedAt).toLocaleDateString("zh-CN")} · ${e(sourceStatus(source))}`}</small></td>${Object.entries(dimensions).map(([key, dimension]) => {
    const observations = items.filter(item => item.sourceId === source.id && item.key === key);
    return `<td>${observations.length ? observations.map(item => `<button type="button" class="source-value ${item.issue || item.conflict ? "source-questioned" : ""}" data-candidate="${e(candidate.id)}" data-fact="${key}">${e(item.value)} ${dimension.unit}</button><span class="source-verdict">${e(item.overridden ? "原始引文，当前未采用" : item.conflict ? "数值冲突" : item.issue || (space.mode === "demo" ? "合成数值一致" : "引文匹配，配置待核验"))}</span><details><summary>原文依据</summary><blockquote>${e(item.quote)}</blockquote></details>`).join("") : '<span class="no-evidence">未提取到此项引用</span>'}</td>`;
  }).join("")}</tr>`).join("");
  const covered = Object.keys(dimensions).filter(key => new Set(items.filter(i => i.key === key && !i.issue && !i.conflict && !i.overridden).map(i => i.sourceId)).size >= 2).length;
  return {
    summary: `${candidate.name}：关联 ${sources.length} 份${space.mode === "demo" ? "合成资料" : `资料 / ${domains.size} 个站点`}；${covered} 项参数有多条同值引用。${sources.length < 2 ? "当前属于单一来源，尚未形成交叉对照。" : "不同网页可能转载同一材料；同值引用不证明配置一致或事实真实。"}`,
    html: `<table class="source-table"><thead><tr><th>来源与采集时间</th>${Object.values(dimensions).map(d => `<th>${d.label} · 原文依据</th>`).join("")}</tr></thead><tbody>${rows || '<tr><td colspan="5">这个候选还没有可展示的参数引文。检索来源列在下方，不会被自动当作支持证据。</td></tr>'}</tbody></table>`,
    library: space.sources.map(s => `<div class="library-source"><span>${e(s.id)}</span><div>${link(s)}<small>${s.kind === "fixture" ? "合成演示来源" : sourceStatus(s)}${sources.some(source => source.id === s.id) ? " · 被当前候选引用" : " · 当前候选未引用"}${s.retrieval?.engine?` · 检索入口 ${e(s.retrieval.engine)}`:""}</small>${s.retrieval?.query?`<small>查询：${e(s.retrieval.query)}</small>`:""}</div></div>`).join(""),
  };
}
