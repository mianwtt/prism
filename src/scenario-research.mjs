import { resolveScenarioScopes, scenarioSettingsKey } from './scenarios.mjs';
import { factIssue, evaluate } from './engine.mjs';

export const settingsKey = scenarioSettingsKey;
export function scenarioQueries(space,scenario){
  const s=scenario.settings,base=space.baselineSettings||space.settings;
  const range=s.budget>base.budget?`${base.budget}-${s.budget}元`:`${s.budget}元以内`;
  return [`开发笔记本 ${range} ${s.minMemory}GB ${s.maxWeight}kg以内 具体型号 京东 天猫 苏宁`,
    `笔记本 ${s.budget}元 ${s.minMemory}GB 轻薄 本机重量 商品 价格 品牌商城`];
}

export function scenarioQuestion(space, scenario) {
  const baseline=space.baselineSettings||space.settings;
  const names=space.candidates.map(c=>c.name).join('、');
  return `为已有笔记本决策探索新情景，不是只核对旧型号。原始需求：${space.question.slice(0,600)}\n情景：${scenario.name}\n必须按新条件寻找：预算不超过${scenario.settings.budget}元，内存至少${scenario.settings.minMemory}GB，净重不超过${scenario.settings.maxWeight}kg。原预算${baseline.budget}元。已有方案：${names.slice(0,500)}。优先探索已有列表之外符合条件的具体配置，预算增加时重点检查新增预算区间。优先公开购物平台及品牌商城，采集同配置价格、处理器、内存、硬盘、重量、系统、屏幕及来源配图。无需登录，无需下单，缺货不影响资料比较。价格必须有原文，不能把不同配置拼在一起，不得编造。`.slice(0,2000);
}

export function prepareScenario(space, raw, scenarioId) {
  const scenarios=resolveScenarioScopes(space,raw);
  const selected=scenarios.find(s=>s.id===scenarioId);
  if(!selected)throw new Error('请选择有效的情景分支');
  // Scope and research history belong to the server, never to a posted client object.
  const baselineIds=space.baselineCandidateIds||space.candidates.map(c=>c.id);
  return {scenarios,selected,baselineIds};
}

export function mergeScenarioResearch(parent, research, job) {
  const {scenarios,selected,baselineIds}=prepareScenario(parent,job.scenarios,job.scenarioId);
  const result=structuredClone(parent);
  result.baselineCandidateIds=[...baselineIds];
  result.baselineSettings=structuredClone(parent.baselineSettings||parent.settings);
  const sourceMap=new Map(research.sources.map(s=>[s.id,`branch-${job.id.slice(0,8)}-${s.id}`]));
  const relink=value=>Array.isArray(value)?value.map(relink):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,(k==='sourceId'||k==='id')&&sourceMap.has(v)?sourceMap.get(v):relink(v)])):value;
  const added=[],reused=[],rejected=[];
  for(const incoming of research.candidates){
    if(incoming.productData?.status!=='comparison-ready'||['price','memory','weight'].some(k=>factIssue(k,incoming.facts[k]))){
      rejected.push({name:incoming.name,reason:'尚未取得同配置的完整核心字段，不进入比较'});continue;
    }
    const productKey=c=>c.productData?JSON.stringify([c.productData.sourceProductUrl,...['cpu','memoryGB','storageGB','screenResolution'].map(k=>c.productData.fields[k]?.value)]):null;
    const known=result.candidates.find(c=>productKey(c)&&productKey(c)===productKey(incoming));
    if(known){reused.push(known.id);continue;}
    if(result.candidates.length>=12){rejected.push({name:incoming.name,reason:'空间已达 12 个方案，原始方案保持不变'});continue;}
    const candidate=relink(incoming);
    candidate.id=`branch-${job.id.slice(0,8)}-${incoming.id}`;
    candidate.discoveredInScenario=selected.id;
    result.candidates.push(candidate);added.push(candidate.id);
  }
  result.sources.push(...research.sources.map(s=>({...s,id:sourceMap.get(s.id)})));
  selected.candidateIds=[...new Set([...selected.candidateIds,...added,...reused])];
  const eligible=evaluate(result.candidates.filter(c=>selected.candidateIds.includes(c.id)),selected.settings).filter(r=>r.status==='eligible').length;
  selected.research={status:'complete',jobId:job.id,at:new Date().toISOString(),settingsKey:settingsKey(selected.settings),settings:structuredClone(selected.settings),addedIds:added,reusedIds:reused,newPages:research.sources.length,eligibleCount:eligible,
    events:structuredClone(job.events),rejected,drafts:relink(research.comparisonData?.researchDrafts||[]),
    summary:added.length?`新增 ${added.length} 个资料完整的方案，当前 ${eligible} 个满足条件。`:'本轮没有取得新的完整方案；保留原有选择和本轮搜索证据。'};
  result.scenarios=scenarios;
  result.activeScenarioId=selected.id;
  result.settings=structuredClone(selected.settings);
  result.trace=[...(parent.trace||[]),...(research.trace||[])];
  result.agent=research.agent;
  if(result.comparisonData)result.comparisonData.comparisonReady=result.candidates.filter(c=>c.productData).map(c=>structuredClone(c.productData));
  result.scenarioResearch={scenarioId:selected.id,jobId:job.id};
  return result;
}
