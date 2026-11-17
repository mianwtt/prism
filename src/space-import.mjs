import { z } from 'zod';
import { adaptLegacyDecision } from './legacy-decision.mjs';
import { validateDecisionSchema, validateDecisionSettings, validateDecisionScenarios } from './decision-schema.mjs';
import { factObservations } from './decision-workflow.mjs';

export const IMPORT_LIMIT = 5 * 1024 * 1024;
const id = z.string().regex(/^[-a-zA-Z0-9]{1,80}$/);
const text = (max) => z.string().max(max);
const url = text(4000).refine(value => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      u.hostname.includes('.') && !/^[\d.]+$|:|(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname);
  } catch { return false; }
}, '导入的来源和图片需要使用公开 HTTPS 地址');
const observation = z.object({ value: z.union([z.number().finite(), text(200), z.boolean(), z.null()]), sourceId: id.nullish(), quote: text(20000).optional() });
const fact = observation.extend({
  status: z.enum(['cited','confirmed','example','unknown','unreviewed','assumption']).optional(),
  evidence: z.array(observation).max(30).optional(),
  conflictingEvidence: z.array(observation).max(30).optional(),
});
const candidate = z.object({
  id, name: text(300).min(1), enabled: z.boolean().optional(), sourceId: id.nullish(),
  facts: z.record(z.string(), fact),
  media: z.object({url, images:z.array(url).max(12).optional(), sourceUrl: url.optional(), sourceId: id.optional()}).optional(),
  displayDetails: z.array(z.object({label:text(80),value:text(1000),quote:text(20000).optional(),sourceId:id.optional()})).max(40).optional(),
});
const source = z.object({
  id, title: text(500), url: url.nullish(), text: text(500000),
  retrievedAt: z.string().datetime(), kind: text(30).optional(),
  refreshStatus: z.enum(['verified','failed']).optional(),
});
const scope = z.array(id).max(200);
const conversationMessage=z.object({
  id:id.optional(),role:z.enum(['user','assistant']),content:text(2400).min(1),
  scenarioId:id.optional(),at:z.string().datetime().optional(),effect:text(2000).optional(),
  researchRequest:text(1500).optional(),changedFields:z.array(text(31)).max(8).optional(),
});
const snapshot = z.object({
  title: text(300).min(1), question: text(4000).min(1), mode: z.enum(['demo','live']),
  candidates: z.array(candidate).max(200), sources: z.array(source).max(300),
  baselineCandidateIds: scope.optional(), activeScenarioId: id.optional(), canvasScenarioIds: z.array(id).max(24).optional(),
  decision: z.object({candidateId:id.nullable(),rationale:text(1500)}).optional(),
  conversation:z.array(conversationMessage).max(2000).optional(),
});

// Import is a new local root, never a write to the exported ID or a source fetch.
// Server-owned IDs, job state, model analysis and previous human confirmations are not accepted.
export function importSpace(raw) {
  if(!raw || typeof raw !== 'object' || Array.isArray(raw))throw new Error('请选择 Prism 导出的决策 JSON 文件');
  let adapted;
  try { adapted = adaptLegacyDecision(raw); } catch { throw new Error('无法识别这个决策文件的模型或条件'); }
  const parsed = snapshot.safeParse(adapted);
  if(!parsed.success)throw new Error('决策文件格式不完整或包含不支持的来源地址');
  const next = parsed.data;
  next.schema = validateDecisionSchema(adapted.schema);
  next.settings = validateDecisionSettings(adapted.settings,next.schema);
  next.baselineSettings = validateDecisionSettings(adapted.baselineSettings||adapted.settings,next.schema);
  for(const collection of [next.sources,next.candidates])if(new Set(collection.map(x=>x.id)).size!==collection.length)throw new Error('来源或方案标识重复');
  const candidateIds = new Set(next.candidates.map(c=>c.id)), sourceIds = new Set(next.sources.map(s=>s.id));
  const checkScope = ids => { if(ids.some(id=>!candidateIds.has(id))||new Set(ids).size!==ids.length)throw new Error('分支包含不存在或重复的方案'); };
  next.baselineCandidateIds??=[...candidateIds];checkScope(next.baselineCandidateIds);
  // Keep only validated scenario properties, including each branch's own research pool.
  const rawScenarios = adapted.scenarios || [];
  if(!Array.isArray(rawScenarios)||rawScenarios.length>24)throw new Error('最多导入 24 个情景');
  next.scenarios = rawScenarios.map(s=>({id:s.id,name:s.name,parentScenarioId:s.parentScenarioId,settings:validateDecisionSettings(s.settings,next.schema),candidateIds:scope.parse(s.candidateIds||[...candidateIds]),...(s.overrides!==undefined?{overrides:s.overrides}:{})}));
  next.scenarios.forEach(s=>checkScope(s.candidateIds));
  next.scenarios=validateDecisionScenarios(next,next.scenarios);
  if(!next.scenarios.some(s=>s.id===next.activeScenarioId))next.activeScenarioId='scenario-baseline';
  next.settings=structuredClone(next.scenarios.find(s=>s.id===next.activeScenarioId).settings);
  if(next.canvasScenarioIds?.some(id=>!next.scenarios.some(s=>s.id===id)))throw new Error('画布引用了不存在的分支');
  if(next.decision?.candidateId&&!candidateIds.has(next.decision.candidateId))throw new Error('判断记录中的方案不存在');
  if(next.decision)next.decision.candidateName=next.candidates.find(c=>c.id===next.decision.candidateId)?.name||null;
  for(const c of next.candidates){
    if(c.sourceId&&!sourceIds.has(c.sourceId))throw new Error('方案引用的来源不存在');
    for(const [key,f] of Object.entries(c.facts)){
      if(!next.schema.fields.some(field=>field.key===key))throw new Error('参数不属于这个决策模型');
      for(const o of [f,...(f.evidence||[]),...(f.conflictingEvidence||[])])if(o.sourceId&&!sourceIds.has(o.sourceId))throw new Error('参数引用的来源不存在');
      const field=next.schema.fields.find(field=>field.key===key);
      const supported=factObservations(next,c,field).some(o=>o.verifiable&&o.value===f.value&&o.sourceId===f.sourceId&&o.quote===f.quote);
      f.status=next.mode==='demo'?'example':supported?'cited':'unknown';
    }
  }
  next.importInfo={importedAt:new Date().toISOString(),kind:'snapshot',notice:'从文件创建的新空间；历史版本和人工确认不继承。'};
  next.trace=[{type:'import',message:next.importInfo.notice}];
  next.warnings=[next.importInfo.notice];
  return next;
}
