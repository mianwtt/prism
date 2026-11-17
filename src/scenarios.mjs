import { validateSettings, evaluate, comparison, dimensions } from "./engine.mjs";
export const scenarioSettingsKey = settings => JSON.stringify([settings.budget,settings.minMemory,settings.maxWeight]);

export function validateScenarios(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 24) throw new Error("情景分支必须为 1–24 个");
  const ids = new Set();
  return raw.map(item => {
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9-]{1,60}$/.test(item.id) || ids.has(item.id)) throw new Error("无效或重复的情景标识");
    if (typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 40) throw new Error("情景名称必须为 1–40 字");
    ids.add(item.id);
    if(item.parentScenarioId!==undefined&&(typeof item.parentScenarioId!=='string'||!/^[a-zA-Z0-9-]{1,60}$/.test(item.parentScenarioId)))throw new Error('无效的父情景标识');
    return { id: item.id, name: item.name.trim(), settings: validateSettings(item.settings),
      ...(item.parentScenarioId?{parentScenarioId:item.parentScenarioId}:{}),
      ...(Array.isArray(item.candidateIds)?{candidateIds:item.candidateIds.filter(id=>typeof id==='string').slice(0,12)}:{}),
      ...(item.research&&typeof item.research==='object'?{research:structuredClone(item.research)}:{}) };
  });
}
export function resolveScenarioScopes(space,raw){
 const scenarios=validateScenarios(raw),baseline=space.baselineCandidateIds||space.candidates.map(c=>c.id),validIds=new Set(space.candidates.map(c=>c.id));
 const original=space.scenarios?.find(s=>s.id==='scenario-baseline');
 if(original&&!scenarios.some(s=>s.id==='scenario-baseline'))scenarios.unshift(structuredClone(original));
 const fixed=scenarios.find(s=>s.id==='scenario-baseline');
 if(fixed){fixed.name='当前情况';fixed.settings=structuredClone(space.baselineSettings||space.settings);fixed.candidateIds=[...baseline];delete fixed.parentScenarioId;}
 if(scenarios.length>24)throw new Error('最多保存 24 个情景');
 const resolved=new Map(),visiting=new Set();
 function resolve(id){
  if(resolved.has(id))return resolved.get(id);
  if(visiting.has(id))throw new Error('情景分支不能循环继承');
  visiting.add(id);
  const prior=space.scenarios?.find(s=>s.id===id),item=scenarios.find(s=>s.id===id);
  if(!prior&&!item)throw new Error('父情景不存在');
  const parent=prior?prior.parentScenarioId:item.parentScenarioId;
  const ids=prior?(prior.candidateIds||baseline):parent?resolve(parent):baseline;
  const result=[...new Set(ids.filter(id=>validIds.has(id)))];
  visiting.delete(id);resolved.set(id,result);return result;
 }
 for(const item of scenarios){
  if(item.id==='scenario-baseline'){item.candidateIds=[...baseline];delete item.research;if(original?.research)item.research=structuredClone(original.research);continue;}
  const prior=space.scenarios?.find(s=>s.id===item.id);
  item.candidateIds=[...resolve(item.id)];delete item.research;
  if(prior){delete item.parentScenarioId;if(prior.parentScenarioId)item.parentScenarioId=prior.parentScenarioId;}
  if(prior?.research)item.research=structuredClone(prior.research);
 }
 return scenarios;
}
export function scenarioCandidates(space,scenario) {
  const ids=scenario?.candidateIds||space.baselineCandidateIds;
  return ids?space.candidates.filter(c=>ids.includes(c.id)):space.candidates;
}
export function analyzeScenario(space,scenario) {
  const base=space.baselineSettings||space.settings;
  const result=scenarioAnalysis(space.candidates,base,scenario.settings);
  const before=evaluate(scenarioCandidates(space,{candidateIds:space.baselineCandidateIds}),base);
  const after=evaluate(scenarioCandidates(space,scenario),scenario.settings);
  const absent=id=>({id,status:'excluded',score:null,reasons:['不在该情景的已研究方案中'],unknown:[]});
  return {...result,before,after,diff:comparison(before,after),rows:space.candidates.filter(c=>before.some(r=>r.id===c.id)||after.some(r=>r.id===c.id)).map(c=>{
    const a=before.find(r=>r.id===c.id)||absent(c.id),b=after.find(r=>r.id===c.id)||absent(c.id);
    return {id:c.id,name:c.name,before:a,after:b,delta:a.score!==null&&b.score!==null?b.score-a.score:null,entered:a.status!=='eligible'&&b.status==='eligible',exited:a.status==='eligible'&&b.status!=='eligible'};
  })};
}
export function scenarioAnalysis(candidates, baseline, current) {
  const before = evaluate(candidates, baseline), after = evaluate(candidates, current);
  const changes = [];
  for (const [key, label, unit] of [["budget", "预算", "元"], ["minMemory", "最低内存", "GB"], ["maxWeight", "重量上限", "kg"]])
    if (baseline[key] !== current[key]) changes.push({ label, before: baseline[key], after: current[key], unit });
  for (const [key, d] of Object.entries(dimensions))
    if (baseline.weights[key] !== current.weights[key]) changes.push({ label: d.label + "权重", before: baseline.weights[key], after: current.weights[key], unit: "" });
  if ((baseline.calculationMode || "reviewed") !== (current.calculationMode || "reviewed"))
    changes.push({ label: "计算依据", before: baseline.calculationMode === "provisional" ? "试算" : "已确认", after: current.calculationMode === "provisional" ? "试算" : "已确认", unit: "" });
  return {
    before, after, changes, diff: comparison(before, after),
    rows: candidates.map(c => {
      const a = before.find(r => r.id === c.id), b = after.find(r => r.id === c.id);
      return { id: c.id, name: c.name, before: a, after: b,
        delta: a.score !== null && b.score !== null ? b.score - a.score : null,
        entered: a.status !== "eligible" && b.status === "eligible",
        exited: a.status === "eligible" && b.status !== "eligible" };
    }),
  };
}
