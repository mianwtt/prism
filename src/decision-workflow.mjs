import {decisionScenarios,evaluateDecision,hasDecisionValue,validateDecisionSettings} from './decision-schema.mjs';
import {observationIssue,observationConversion} from './decision-evidence.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function factObservations(space,candidate,field){
  const fact=candidate.facts[field.key]||{},all=[fact,...(fact.evidence||[]),...(fact.conflictingEvidence||[])],seen=new Set();
  return all.filter(o=>hasDecisionValue(o.value,field)&&o.sourceId&&o.quote).filter(o=>{const key=JSON.stringify([o.value,o.sourceId,o.quote]);if(seen.has(key))return false;seen.add(key);return true;}).map(o=>{
    const source=space.sources.find(s=>s.id===o.sourceId),issue=observationIssue(field,o,source);
    const conversion=observationConversion(field,o);
    return {...o,source,verifiable:!issue,...(conversion?{conversion}:{}),...(issue?{verificationIssue:issue}:{})};
  });
}
export function evidenceRows(space,candidate){
  return space.schema.fields.map(field=>{
    const fact=candidate.facts[field.key]||{},observations=factObservations(space,candidate,field);
    const conflict=new Set(observations.filter(o=>o.verifiable).map(o=>JSON.stringify(o.value))).size>1;
    const primary=observations.find(o=>o.sourceId===fact.sourceId&&o.value===fact.value&&o.quote===fact.quote);
    const status=fact.status==='example'?'example':fact.confirmation==='user-assumption'?'assumption':fact.status==='confirmed'&&primary?.verifiable?'confirmed':conflict?'conflict':fact.status==='cited'&&primary?.verifiable?'cited':observations.some(o=>o.verifiable)?'unselected':hasDecisionValue(fact.value,field)?'unsupported':'missing';
    return {field,fact,observations,conflict,status};
  });
}
export function reviewDecisionFacts(space,reviews){
  if(!Array.isArray(reviews)||reviews.length>24)throw new Error('引用确认格式无效');
  if(space.mode==='demo'&&reviews.length)throw new Error('演示引用不能确认为真实资料');
  const next=structuredClone(space);
  for(const review of reviews){
    const candidate=next.candidates.find(c=>c.id===review.candidateId),field=next.schema.fields.find(f=>f.key===review.key);
    if(!candidate||!field)throw new Error('请选择现有方案和比较维度');
    const previous=candidate.facts[field.key]||{};
    if(review.action==='withdraw'){
      if(previous.confirmation!=='user-reviewed')throw new Error('该引用没有可撤销的人工确认');
      candidate.facts[field.key]=previous.reviewBefore||{...previous,status:'cited',confirmation:undefined,reviewedAt:undefined};
      continue;
    }
    if(review.action!=='confirm')throw new Error('引用确认操作无效');
    const observation=factObservations(next,candidate,field).find(o=>equal(o.value,review.value)&&o.sourceId===review.sourceId&&o.quote===review.quote&&o.verifiable);
    if(!observation)throw new Error('只能确认已保存且与原文匹配的引用，不能凭空修改事实');
    const before=structuredClone(previous.reviewBefore||previous);delete before.reviewBefore;
    candidate.facts[field.key]={...previous,value:observation.value,sourceId:observation.sourceId,quote:observation.quote,status:'confirmed',confirmation:'user-reviewed',reviewedAt:new Date().toISOString(),reviewBefore:before};
  }
  if(reviews.length)delete next.analysis;
  return next;
}
export function captureDecision(space,input,selected){
  const c=space.candidates.find(c=>c.id===input?.candidateId);
  if(!input||typeof input.rationale!=='string'||input.rationale.length>1500||(input.candidateId!==null&&!c)||(!c&&!input.rationale.trim()))throw new Error('请选择现有方案或填写选择理由');
  const candidates=space.candidates.filter(c=>selected.candidateIds.includes(c.id)),snapshotSchema=structuredClone(space.schema);
  for(const f of snapshotSchema.fields)if((f.type||'number')==='number'&&!f.range){const values=candidates.map(c=>c.facts[f.key]?.value).filter(Number.isFinite);if(values.length)f.range={min:Math.min(...values),max:Math.max(...values)};}
  const ranked=evaluateDecision(candidates,selected.settings,snapshotSchema);
  const ids=new Set(c?Object.values(c.facts).flatMap(f=>[f.sourceId,...(f.evidence||[]).map(o=>o.sourceId)]).filter(Boolean):[]);
  return {candidateId:c?.id||null,candidateName:c?.name||null,rationale:input.rationale.trim(),recordedAt:new Date().toISOString(),context:{scenarioId:selected.id,scenarioName:selected.name,settings:structuredClone(selected.settings),schema:structuredClone(space.schema),normalization:Object.fromEntries(snapshotSchema.fields.filter(f=>f.range).map(f=>[f.key,structuredClone(f.range)])),candidateIds:[...selected.candidateIds],candidateFacts:c?structuredClone(c.facts):null,assessment:ranked.find(r=>r.id===c?.id)?.status||(c?'outside-scope':'undecided'),ranked:ranked.map(({id,status,score})=>({id,status,score})),sources:space.sources.filter(s=>ids.has(s.id)).map(s=>({id:s.id,url:s.url,retrievedAt:s.retrievedAt,refreshStatus:s.refreshStatus||null}))}};
}
export function reassessDecision(space){
  const decision=space.decision,context=decision?.context;
  if(!decision)return null;
  if(!context)return {legacy:true,needsReview:false,changes:[],message:'这条旧记录没有保存完整的情景快照。'};
  const candidate=space.candidates.find(c=>c.id===decision.candidateId),changes=[],replaySchema={...space.schema,fields:[...context.schema.fields,...space.schema.fields.filter(f=>!context.schema.fields.some(old=>old.key===f.key))]};
  replaySchema.fields=replaySchema.fields.map(f=>({...f,...(context.normalization?.[f.key]?{range:context.normalization[f.key]}:{})}));
  if(decision.candidateId&&!candidate)changes.push({type:'removed',message:'当时选择的方案已不在当前资料中'});
  if(candidate)for(const field of space.schema.fields){
    const before=context.candidateFacts?.[field.key],after=candidate.facts[field.key];
    if(!equal(before?.value,after?.value)||before?.status!==after?.status||before?.sourceId!==after?.sourceId||before?.quote!==after?.quote)changes.push({type:'fact',field:field.key,label:field.label,before:before?.value??null,after:after?.value??null,message:field.label+'的数值或引用状态发生变化'});
  }
  const settings=validateDecisionSettings({limits:context.settings.limits,weights:Object.fromEntries(replaySchema.fields.map(f=>[f.key,context.settings.weights[f.key]??0])),evidenceMode:context.settings.evidenceMode},replaySchema);
  const scenario=decisionScenarios(space).find(s=>s.id===context.scenarioId),ids=scenario?.candidateIds||context.candidateIds;
  const ranked=evaluateDecision(space.candidates.filter(c=>ids.includes(c.id)),settings,replaySchema),assessment=ranked.find(r=>r.id===candidate?.id)?.status||(candidate?'outside-scope':'undecided');
  if(assessment!==context.assessment)changes.push({type:'eligibility',message:'按当时的条件重新计算，匹配状态发生变化',before:context.assessment,after:assessment});
  const oldFirst=context.ranked?.find(r=>r.status==='eligible')?.id,newFirst=ranked.find(r=>r.status==='eligible')?.id;
  if(oldFirst!==newFirst)changes.push({type:'ranking',message:'按当时偏好排序，最靠前的可选方案发生变化'});
  const sourceUpdates=[];
  for(const old of context.sources){const source=space.sources.find(s=>s.id===old.id);if(!source||source.refreshStatus==='failed')changes.push({type:'source',sourceId:old.id,message:source?.refreshStatus==='failed'?'一份当时引用的来源目前未能读取':'当时引用的来源不再存在'});else if(source.retrievedAt!==old.retrievedAt)sourceUpdates.push({sourceId:old.id,retrievedAt:source.retrievedAt});}
  return {legacy:false,needsReview:changes.length>0,changes,sourceUpdates,assessment,settings,scenarioId:context.scenarioId,message:changes.length?'资料或匹配结果已有变化，建议重新看看这次判断。':'按已保存的资料重新计算，暂未发现影响这次判断的变化。'};
}
export function diffDecisionSpaces(before,after){
  const settingsChanges=[],candidateChanges=[],factChanges=[],sourceChanges=[],schemaChanges=[];
  for(const f of after.schema.fields){if(!before.schema.fields.some(x=>x.key===f.key))schemaChanges.push({field:f.key,label:f.label,type:'added'});if(!equal(before.settings.limits[f.key]??null,after.settings.limits[f.key]??null))settingsChanges.push({field:f.label,before:before.settings.limits[f.key]??null,after:after.settings.limits[f.key]??null});if((before.settings.weights[f.key]??0)!==after.settings.weights[f.key])settingsChanges.push({field:f.label+'偏好',before:before.settings.weights[f.key]??0,after:after.settings.weights[f.key]});}
  for(const f of before.schema.fields)if(!after.schema.fields.some(x=>x.key===f.key))schemaChanges.push({field:f.key,label:f.label,type:'removed'});
  for(const c of after.candidates){
    const old=before.candidates.find(x=>x.id===c.id);if(!old){candidateChanges.push({id:c.id,name:c.name,type:'added'});continue;}
    if(old.name!==c.name||old.enabled!==c.enabled)candidateChanges.push({id:c.id,name:c.name,type:'changed'});
    for(const f of after.schema.fields){const a=old.facts[f.key],b=c.facts[f.key];if(!equal(a?.value,b?.value)||a?.status!==b?.status||a?.sourceId!==b?.sourceId||a?.quote!==b?.quote)factChanges.push({candidateId:c.id,name:c.name,field:f.key,label:f.label,before:a||null,after:b||null});}
  }
  for(const c of before.candidates)if(!after.candidates.some(x=>x.id===c.id))candidateChanges.push({id:c.id,name:c.name,type:'removed'});
  for(const s of after.sources){const old=before.sources.find(x=>x.id===s.id);if(!old||old.text!==s.text||old.refreshStatus!==s.refreshStatus||old.retrievedAt!==s.retrievedAt)sourceChanges.push({id:s.id,title:s.title,status:!old?'added':s.refreshStatus==='failed'?'unavailable':'changed'});}
  for(const s of before.sources)if(!after.sources.some(x=>x.id===s.id))sourceChanges.push({id:s.id,title:s.title,status:'removed'});
  const shape=s=>s?{name:s.name,parent:s.parentScenarioId||'scenario-baseline',settings:s.settings,candidateIds:[...(s.candidateIds||[])].sort()}:null;
  return {beforeId:before.id,afterId:after.id,settingsChanges,candidateChanges,factChanges,sourceChanges,schemaChanges,scenarioChanges:[...(after.scenarios||[]).filter(s=>!equal(shape(s),shape(before.scenarios?.find(o=>o.id===s.id)))).map(s=>({id:s.id,name:s.name,type:before.scenarios?.some(o=>o.id===s.id)?'changed':'added'})),...(before.scenarios||[]).filter(s=>!after.scenarios?.some(o=>o.id===s.id)).map(s=>({id:s.id,name:s.name,type:'removed'}))],decisionChange:equal(before.decision,after.decision)?null:{before:before.decision||null,after:after.decision||null}};
}
