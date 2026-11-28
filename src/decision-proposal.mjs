import {decisionAnswerContext,buildDecisionAnswer,decisionBasisKey} from './decision-answer.mjs';
import {decisionGuidance} from './decision-guidance.mjs';
import {formatDecisionValue} from './decision-schema.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const originNames={model:'模型建议，经程序校验',rules:'规则初筛，尚未形成模型解读',recorded:'已保存分析，未标注生成方式'};
const safeLink=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};

// One deliverable model drives both the readable proposal and Markdown export.
// All numbers and citations are rebuilt from this branch's checked observations.
export function decisionProposal(space,selected,{scenarios=space.scenarios||[]}={}){
  const context=decisionAnswerContext(space,selected),basisKey=decisionBasisKey(space,selected);
  const pool=new Map(space.candidates.filter(c=>(selected.candidateIds||space.candidates.map(c=>c.id)).includes(c.id)).map(c=>[c.id,c]));
  const saved=[...(space.conversation||[])].reverse().find(m=>m.role==='assistant'&&m.decisionAnswer?.scenarioId===selected.id&&m.decisionAnswer.kind!=='investigation'&&m.decisionAnswer.basisKey===basisKey)?.decisionAnswer;
  const answer=buildDecisionAnswer(saved||null,space,selected);
  const origin=!saved||answer.origin==='rules'?'rules':saved.origin||'recorded';
  const guidance=decisionGuidance(space,selected);
  const references=[],referenceIds=new Map();
  const citations=(candidateId,fields)=>context.candidates.find(c=>c.id===candidateId)?.evidence.filter(e=>fields.includes(e.field)).map(e=>{
    const source=space.sources.find(s=>s.id===e.sourceId),field=space.schema.fields.find(f=>f.key===e.field);
    const value={...e,displayValue:formatDecisionValue(e.value,field),candidateId,candidateName:pool.get(candidateId)?.name,sourceTitle:source?.title||e.sourceId,url:safeLink(source?.url),retrievedAt:source?.retrievedAt||null};
    const key=JSON.stringify([candidateId,e.field,e.sourceId,e.quote]);
    if(!referenceIds.has(key)){referenceIds.set(key,'E'+(references.length+1));references.push({...value,referenceId:referenceIds.get(key)});}
    return {...value,referenceId:referenceIds.get(key)};
  })||[];
  const recommendations=answer.recommendations.map(r=>({...r,name:pool.get(r.candidateId).name,media:pool.get(r.candidateId).media||null,citations:citations(r.candidateId,r.fields)}));
  const selectedIds=new Set(recommendations.map(r=>r.candidateId));
  const alternatives=context.candidates.filter(c=>c.status==='eligible'&&!selectedIds.has(c.id)).map(c=>({candidateId:c.id,name:c.name,dominatedBy:c.dominatedBy.map(id=>pool.get(id)?.name).filter(Boolean),citations:citations(c.id,c.evidence.slice(0,3).map(e=>e.field))}));
  const comparisons=[];
  for(const recommendation of recommendations){
    const candidate=context.candidates.find(c=>c.id===recommendation.candidateId);
    const others=context.candidates.filter(c=>c.status==='eligible'&&c.id!==candidate.id);
    for(const other of others.slice(0,4)){
      const strengths=[],sacrifices=[];
      for(const field of space.schema.fields.filter(f=>(f.type||'number')==='number'&&selected.settings.weights[f.key]>0)){
        const a=candidate.evidence.find(e=>e.field===field.key),b=other.evidence.find(e=>e.field===field.key);
        if(!a||!b||a.value===b.value)continue;
        const difference={field:field.key,label:field.label,value:a.value,otherValue:b.value,displayValue:formatDecisionValue(a.value,field),otherDisplayValue:formatDecisionValue(b.value,field)};
        ((a.value-b.value)*field.direction>0?strengths:sacrifices).push(difference);
      }
      if(strengths.length||sacrifices.length)comparisons.push({candidateId:candidate.id,name:candidate.name,otherId:other.id,otherName:other.name,strengths,sacrifices});
    }
  }
  const byId=new Map(scenarios.map(s=>[s.id,s])),ancestors=new Set();let cursor=selected;
  while(cursor&&!ancestors.has(cursor.id)){ancestors.add(cursor.id);cursor=byId.get(cursor.parentScenarioId);}
  const experiments=scenarios.filter(s=>s.parentScenarioId&&(ancestors.has(s.id)||s.parentScenarioId===selected.id)).slice(0,12).flatMap(s=>{
    const parent=byId.get(s.parentScenarioId);if(!parent)return [];
    const before=decisionAnswerContext(space,parent).ranked.filter(r=>r.status==='eligible'),after=decisionAnswerContext(space,s).ranked.filter(r=>r.status==='eligible');
    return [{id:s.id,name:s.name,parentName:parent.name,current:s.id===selected.id,
      changes:space.schema.fields.filter(f=>parent.settings.limits[f.key]!==s.settings.limits[f.key]).map(f=>({field:f.key,label:f.conditionLabel||f.label,before:formatDecisionValue(parent.settings.limits[f.key],f),after:formatDecisionValue(s.settings.limits[f.key],f)})),
      preferencesChanged:!same(parent.settings.weights,s.settings.weights),poolChanged:!same(parent.candidateIds,s.candidateIds),beforeCount:before.length,afterCount:after.length,
      entered:after.filter(r=>!before.some(p=>p.id===r.id)).map(r=>r.name),exited:before.filter(r=>!after.some(p=>p.id===r.id)).map(r=>r.name)}];
  });
  const checks=guidance.investigations.map(t=>({id:t.id,candidateId:t.candidateId,name:t.candidateName,fields:t.fields.map(f=>f.label),kind:t.kind,reason:t.reason}));
  const rejected=context.candidates.filter(c=>['excluded','unresolved','disabled'].includes(c.status)).map(c=>({candidateId:c.id,name:c.name,status:c.status,reasons:[...c.reasons,...c.missing.map(f=>f+'缺少可用依据')]}));
  const decision=space.decision,chosen=decision?.candidateId?pool.get(decision.candidateId):null;
  let selection=null;
  if(decision){
    const recordedSources=decision.context?.sources||[];
    const current=chosen&&decision.context?.scenarioId===selected.id&&same(decision.context.settings,selected.settings)&&same(decision.context.candidateFacts,chosen.facts)&&context.ranked.some(r=>r.id===chosen.id&&r.status==='eligible')&&recordedSources.every(old=>{
      const source=space.sources.find(s=>s.id===old.id);return source&&source.refreshStatus!=='failed'&&source.retrievedAt===old.retrievedAt&&source.url===old.url;
    });
    selection={candidateId:decision.candidateId,name:decision.candidateName||'尚未选定',rationale:decision.rationale||'',recordedAt:decision.recordedAt||null,status:current?'current':decision.context?'needs-review':'historical'};
  }
  const eligible=context.ranked.filter(r=>r.status==='eligible').length,unresolved=context.ranked.filter(r=>r.status==='unresolved').length;
  const state=!pool.size?'empty':!eligible?unresolved?'needs-evidence':'no-match':selection?.status==='current'?'chosen':checks.length?'needs-check':origin==='rules'?'screened':'reviewable';
  const states={empty:['先取得候选资料','目标与条件已保留，继续研究具体方案。'], 'needs-evidence':['关键依据不足','先核对缺失字段，再形成选型建议。'],'no-match':['当前没有匹配方案','保留原条件，可以在画布验证其他假设或继续找方案。'],chosen:['已记录当前选择','建议、用户选择和资料依据已在本分支对应。'],'needs-check':['有建议，仍需核对','已有可比较方案，未决信息可能影响最终取舍。'],screened:['已完成规则初筛','可以先核对候选，或生成当前条件下的选型解读。'],reviewable:['可供讨论的选型建议','结合建议、替代方案与条件推演，再确认最终选择。']};
  return {version:1,basisKey,scenarioId:selected.id,scenarioName:selected.name,title:space.title,question:space.question,mode:space.mode,state,stateTitle:states[state][0],stateDescription:states[state][1],
    origin,originLabel:originNames[origin],hasCurrentAnalysis:Boolean(saved),recommendations,alternatives,comparisons,checks,rejected,experiments,thresholds:guidance.suggestions,selection,context,references,
    counts:{candidates:pool.size,eligible,unresolved,sources:new Set(context.candidates.flatMap(c=>c.evidence.map(e=>e.sourceId))).size}};
}
