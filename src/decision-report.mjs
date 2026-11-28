import {evaluateDecision,formatDecisionValue,summarizeConditions} from './decision-schema.mjs';
import {evidenceRows} from './decision-workflow.mjs';
import {decisionProposal} from './decision-proposal.mjs';
import {offerComparison} from './product-offers.mjs';

const cell=value=>String(value??'').replace(/\r?\n/g,' ').replace(/\|/g,'\\|').replace(/[<>]/g,'');
const text=value=>String(value??'').replace(/[<>]/g,'');
const statusName={eligible:'符合条件',excluded:'不符合条件',unresolved:'依据不足',disabled:'暂停比较'};

// Export current evidence and user decisions. Never invent a model recommendation.
export function decisionReport(space,selected,{hasUnsavedChanges=false}={}) {
  const pool=space.candidates.filter(candidate=>(selected.candidateIds||space.candidates.map(item=>item.id)).includes(candidate.id));
  const proposal=decisionProposal(space,selected),ranked=proposal.context.ranked;
  const validAnalysis=space.analysis?.settingsKey===JSON.stringify(selected.settings)
    && (!space.analysis.scenarioId||space.analysis.scenarioId===selected.id) ? space.analysis : null;
  const lines=[`# ${text(space.title)}｜决策建议书`,'',
    `资料版本：v${space.version||1}；当前路径：${text(selected.name)}`,
    hasUnsavedChanges?'条件采用导出时的画布草稿，尚未另存为新版本。':'条件采用导出时的当前路径。',
    space.mode==='demo'?'资料性质：虚构演示，不对应实际商品或房源。':'资料性质：已保存的网页观察；采集时间与引用见下文。','',
    '## 目标与当前条件','',text(space.question),'',summarizeConditions(selected.settings,space.schema),'',
    '## 当前建议与主要取舍','',`当前状态：${proposal.stateTitle}。${proposal.stateDescription}`,`建议性质：${proposal.originLabel}。`,''];
  if(!proposal.recommendations.length)lines.push('当前不强行推荐方案；先处理缺失依据或验证其他条件。','');
  for(const r of proposal.recommendations){
    lines.push('### '+text(r.name),'',text(r.reason),'',...r.citations.map(c=>'- '+text(c.label)+'：'+text(c.displayValue)+'（'+c.referenceId+'）'),'');
  }
  const comparisons=pool.map(c=>({c,comparison:offerComparison(c,space.sources,space.schema)})).filter(x=>x.comparison?.offers.length);
  if(comparisons.length){lines.push('## 同款多来源报价','','仅比较已读取且标识、配置一致的来源；不保证全网最低。运费不齐时按公开标价比较，不能称为最终到手价。','');
    for(const {c,comparison} of comparisons){lines.push('### '+text(c.name),'','| 商家 | 标价 | 运费 | 条件与状态 | 来源 |','| --- | --- | --- | --- | --- |');
      for(const o of comparison.offers)lines.push('| '+cell(o.seller)+(o.id===c.commerce?.selectedOfferId?'（当前采用）':'')+' | '+cell(o.currency+' '+o.price)+' | '+cell(o.shipping??'未核实')+' | '+cell([o.conditions,...o.reasons,o.availability==='unknown'?'库存待确认':o.availability].filter(Boolean).join('；'))+' | ['+cell(o.retrievedAt)+']('+o.url+') |');lines.push('');}}
  for(const comparison of proposal.comparisons.slice(0,4)){
    lines.push('相较 '+text(comparison.otherName)+'，'+text(comparison.name)+'：',
      ...comparison.strengths.map(c=>'- 占优维度：'+text(c.label)+' '+text(c.displayValue)+'；对方 '+text(c.otherDisplayValue)),
      ...comparison.sacrifices.map(c=>'- 需要接受的取舍：'+text(c.label)+' '+text(c.displayValue)+'；对方 '+text(c.otherDisplayValue)),'');
  }
  if(proposal.alternatives.length)lines.push('## 可保留的备选方案','',...proposal.alternatives.map(a=>'- '+text(a.name)+(a.dominatedBy.length?'：在本次已知比较维度上不优于 '+a.dominatedBy.map(text).join('、')+'，仍可保留作参考。':'：仍有独立取舍，建议结合偏好继续比较。')),'');
  lines.push('## 当前比较结果','',`已收集 ${pool.length} 个方案，其中 ${ranked.filter(row=>row.status==='eligible').length} 个符合当前条件。`,
    '排序反映当前条件与权重，不代表客观质量或购买保证。','',
    '| 方案 | 当前状态 | '+space.schema.fields.map(field=>cell(field.label)).join(' | ')+' |',
    '| --- | --- | '+space.schema.fields.map(()=>'---').join(' | ')+' |');
  for(const row of ranked){
    const candidate=pool.find(item=>item.id===row.id);
    lines.push('| '+[candidate.name,statusName[row.status]||row.status,...space.schema.fields.map(field=>{
      const fact=candidate.facts[field.key];
      const verified=proposal.context.candidates.find(c=>c.id===candidate.id)?.evidence.find(e=>e.field===field.key);
      return verified?formatDecisionValue(verified.value,field):'待核对';
    })].map(cell).join(' | ')+' |');
  }
  const parent=space.scenarios?.find(scenario=>scenario.id===selected.parentScenarioId);
  if(parent){
    const before=evaluateDecision(space.candidates.filter(candidate=>parent.candidateIds.includes(candidate.id)),parent.settings,space.schema).filter(row=>row.status==='eligible');
    const after=ranked.filter(row=>row.status==='eligible');
    const entered=after.filter(row=>!before.some(old=>old.id===row.id));
    const exited=before.filter(row=>!after.some(next=>next.id===row.id));
    lines.push('','## 与父分支的变化','',`父分支：${text(parent.name)}；按各自条件及候选范围比较。`,
      `- 新进入符合条件范围：${entered.map(row=>text(row.name)).join('、')||'无'}`,
      `- 不再符合条件：${exited.map(row=>text(row.name)).join('、')||'无'}`);
  }
  lines.push('','## 取舍与已保存的判断','');
  if(validAnalysis?.summary)lines.push(text(validAnalysis.summary),'');
  if(space.decision)lines.push('保存的倾向：'+text(space.decision.candidateName||'仍在考虑'),'',text(space.decision.rationale||'未填写理由'),'',
    '以上是用户在记录时的判断；本建议书采用当前路径，记录时的条件请在「我的判断」中复核。',
    proposal.selection?.status==='current'?'该选择与当前分支条件和保存事实一致。':'记录对应其他条件、资料或旧上下文，采用前需要复核。');
  else lines.push('尚未记录最终选择。可以结合以下证据与缺口进一步比较。');
  if(proposal.experiments.length)lines.push('','## 已进行的条件推演','',...proposal.experiments.flatMap(e=>[
    '- '+text(e.name)+'：'+e.beforeCount+' → '+e.afterCount+' 个符合条件'+(e.current?'（当前路径）':'')+'。',
    '  条件变化：'+(e.changes.map(c=>text(c.label)+' '+text(c.before)+' → '+text(c.after)).join('；')||'硬条件未改变')+(e.preferencesChanged?'；偏好权重有变化':'')+(e.poolChanged?'；候选资料范围有变化':'')+'。',
    '  进入：'+(e.entered.map(text).join('、')||'无')+'；退出：'+(e.exited.map(text).join('、')||'无')+'。']));
  if(proposal.thresholds.length)lines.push('','## 决定前值得再验证的假设','',...proposal.thresholds.map(h=>'- '+h.changes.map(c=>text(c.label)+' '+text(c.from)+' → '+text(c.value)).join('；')+'：'+h.beforeCount+' → '+h.afterCount+' 个符合条件。该假设尚未自动应用。'));
  if(proposal.references.length)lines.push('','## 建议所引用的原文','',...proposal.references.flatMap(r=>[
    '### '+r.referenceId+' · '+text(r.candidateName)+' · '+text(r.label),'','> '+text(r.quote).replace(/\r?\n/g,' '),'',
    '来源：'+text(r.sourceTitle)+(r.url?' — '+r.url:'')+'；采集时间：'+text(r.retrievedAt||'未记录'),'']));
  lines.push('','## 排除原因与待核对事项','');
  let issues=0;
  for(const row of ranked){
    const candidate=pool.find(item=>item.id===row.id);
    for(const reason of [...row.reasons,...row.missing.map(label=>label+'缺少可用依据')]){lines.push('- '+text(candidate.name)+'：'+text(reason));issues++;}
    for(const field of evidenceRows(space,candidate))if(['conflict','unsupported','unselected'].includes(field.status)){
      lines.push('- '+text(candidate.name)+'：'+text(field.field.label)+'的来源存在分歧或尚未确认采用。');issues++;
    }
  }
  if(!pool.length)lines.push('- 尚无可比较方案，需要继续研究。');
  else if(!issues)lines.push('- 当前保存记录中未发现规则识别出的证据缺口；仍需复核来源时效与适用条件。');
  lines.push('','## 字段依据与来源','');
  for(const row of ranked){
    const candidate=pool.find(item=>item.id===row.id);
    lines.push('### '+text(candidate.name),'');
    for(const field of evidenceRows(space,candidate)){
      const fact=field.fact;
      const observation=field.observations.find(item=>item.sourceId===fact.sourceId&&item.value===fact.value&&item.quote===fact.quote);
      lines.push('- '+text(field.field.label)+'：'+(['cited','confirmed'].includes(field.status)?'有可核对引用':field.status==='example'?'虚构演示依据':'待核对'));
      if(observation?.verifiable){
        lines.push('  > '+text(observation.quote).replace(/\r?\n/g,' '));
        const source=observation.source;
        if(source) {
          const link=(()=>{try{const url=new URL(source.url);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}})();
          lines.push('  来源：'+text(source.title||source.id)+(link?' — '+link:'')+'；采集时间：'+text(source.retrievedAt||'未记录'));
        }
      }
    }
    lines.push('');
  }
  if(space.taskMemory?.text)lines.push('## 用户任务备忘','',text(space.taskMemory.text),'','此处是用户背景与待办，不是来源证据，也不自动更改硬条件。','');
  lines.push('## 下一步','',issues||!pool.length?'- 先核对上述缺失、冲突和来源条件，再决定是否采用方案。':'- 复核你最在意的取舍，记录倾向与理由。',
    '- 改变已知条件时可复用当前事实推演；需要新候选或新字段时继续研究。','',
    '本简报基于当前保存的研究范围，不表示已经穷尽所有市场选择。','');
  return lines.join('\n');
}
