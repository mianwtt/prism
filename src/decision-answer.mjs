import {evaluateDecision,formatDecisionValue} from './decision-schema.mjs';
import {evidenceRows} from './decision-workflow.mjs';
import {decisionGuidance} from './decision-guidance.mjs';
import {offerComparison} from './product-offers.mjs';

export const asksForDecision=message=>/怎么选|如何选|选哪|推荐|比较|对比|取舍|建议|更合适|更适合|结论|报告/.test(message);
export const asksForNextEvidence=message=>/下一步|先查什么|先核对|值得.*(?:查|核对)|缺.*(?:信息|依据|资料)/.test(message);
export const asksForOfferComparison=message=>/商家|同款|报价|比价|购买来源/.test(message)&&/比较|对比|差额|差价|便宜|低价|价格|报价/.test(message);
function checkedPurchaseReason(candidate){
  const p=candidate.purchaseSources;if(!p)return null;
  const current=p.offers.find(o=>o.id===p.selectedOfferId),best=p.offers.find(o=>o.id===p.bestOfferId);
  if(!current?.comparable||!best||p.offers.filter(o=>o.comparable).length<2)return null;
  return '同配置已核对报价：'+[...new Map([best,current,...p.offers.filter(o=>o.comparable)].map(o=>[o.id,o])).values()].slice(0,2).map(o=>o.seller+' '+o.price+'元').join('；')+'。当前采用'+current.seller+'。'+(p.currentExtraCost>0?'当前'+(p.priceBasis==='total'?'已知合计':'标价')+'高'+p.currentExtraCost+'元，可在画布切换来源。':'当前采用已读取来源中的可比最低报价。')+(p.offers.some(o=>o.comparable&&o.shipping===null)?'运费未全部核实。':'')+(p.offers.some(o=>o.comparable&&o.availability==='unknown')?'部分来源库存待确认。':'');
}

// A display checksum, not an authorization token. Old advice must not silently
// become current advice after conditions, source text or candidate facts change.
export function decisionBasisKey(space,scenario){
  const ids=new Set(scenario.candidateIds||space.candidates.map(c=>c.id));
  const candidates=space.candidates.filter(c=>ids.has(c.id)),sourceIds=new Set(candidates.flatMap(c=>[c.sourceId,...(c.sourceIds||[]),...Object.values(c.facts).flatMap(f=>[f.sourceId,...(f.evidence||[]).map(e=>e.sourceId)])]));
  const value=JSON.stringify([space.question,space.taskMemory?.text||'',scenario.settings,space.schema.fields,candidates,space.sources.filter(s=>sourceIds.has(s.id)).map(s=>[s.id,s.text,s.retrievedAt])]);
  let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return 'basis-v2-'+(hash>>>0).toString(16)+'-'+value.length;
}

export function decisionAnswerContext(space,scenario){
  const ids=new Set(scenario.candidateIds||space.candidates.map(c=>c.id));
  const candidates=space.candidates.filter(c=>ids.has(c.id)),facts=new Map();
  const clean=candidates.map(c=>{
    const rows=evidenceRows(space,c),valid=rows.filter(r=>(['cited','confirmed'].includes(r.status)||space.mode==='demo'&&r.status==='example')&&(scenario.settings.evidenceMode!=='reviewed'||['confirmed','example'].includes(r.status)));
    facts.set(c.id,valid);
    return {...c,facts:Object.fromEntries(space.schema.fields.map(f=>[f.key,valid.find(r=>r.field.key===f.key)?.fact||{value:null,status:'unknown'}]))};
  });
  const ranked=evaluateDecision(clean,scenario.settings,space.schema);
  const compared=ranked.map(row=>{
    const candidate=candidates.find(c=>c.id===row.id),comparison=offerComparison(candidate,space.sources,space.schema),current=comparison?.offers.find(o=>o.id===candidate.commerce?.selectedOfferId),best=comparison?.offers.find(o=>o.id===comparison.bestOfferId);
    return {id:row.id,name:row.name,status:row.status,reasons:row.reasons,missing:row.missing,
      evidence:(facts.get(row.id)||[]).map(r=>({field:r.field.key,label:r.field.label,value:r.fact.value,unit:r.field.unit,sourceId:r.fact.sourceId,quote:r.fact.quote})),
      ...(comparison?{purchaseSources:{identityVerified:Boolean(comparison.identity),configuration:comparison.configuration,selectedOfferId:current?.id||null,bestOfferId:best?.id||null,priceBasis:comparison.priceBasis,
        currentExtraCost:current?.comparable&&best?Math.round(((comparison.priceBasis==='total'?current.total:current.price)-(comparison.priceBasis==='total'?best.total:best.price))*100)/100:null,
        offers:comparison.offers.map(({id,sourceId,url,seller,price,shipping,total,availability,comparable,reasons,quote,conditions,retrievedAt})=>({id,sourceId,url,seller,price,shipping,total,availability,comparable,reasons,quote,conditions,retrievedAt}))}}:{})};
  });
  const criteria=space.schema.fields.filter(f=>scenario.settings.weights[f.key]>0);
  const utility=(candidate,field)=>{const value=candidate.evidence.find(e=>e.field===field.key)?.value;if(value===undefined)return null;if((field.type||'number')==='number')return value*field.direction;const preferred=scenario.settings.limits[field.key]??field.preferred;return preferred===null?0:Number(value===preferred);};
  for(const candidate of compared){
    candidate.dominatedBy=candidate.status!=='eligible'?[]:compared.filter(other=>other.id!==candidate.id&&other.status==='eligible'&&criteria.length&&criteria.every(f=>utility(candidate,f)!==null&&utility(other,f)!==null&&utility(other,f)>=utility(candidate,f))&&criteria.some(f=>utility(other,f)>utility(candidate,f))).map(c=>c.id);
  }
  return {ranked,candidates:compared};
}

const numericTokens=value=>(String(value).match(/\d[\d,]*(?:\.\d+)?/g)||[]).map(v=>Number(v.replaceAll(',','')));
export function buildDecisionAnswer(proposal,space,scenario){
  const context=decisionAnswerContext(space,scenario),eligible=context.candidates.filter(c=>c.status==='eligible'),frontier=eligible.filter(c=>!c.dominatedBy.length);
  let rejected=0;
  const fallbackReason=candidate=>{
    const purchase=checkedPurchaseReason(candidate);if(purchase)return purchase;
    const advantages=candidate.evidence.filter(e=>{
      const field=space.schema.fields.find(f=>f.key===e.field);
      return (field.type||'number')==='number'&&eligible.length>1&&eligible.every(other=>other.id===candidate.id||other.evidence.some(o=>o.field===e.field&&(field.direction===1?e.value>o.value:e.value<o.value)));
    }).slice(0,2);
    return advantages.length?'在当前符合条件的方案中，'+advantages.map(e=>e.label+'更'+(space.schema.fields.find(f=>f.key===e.field).direction===1?'高':'低')+'（'+formatDecisionValue(e.value,space.schema.fields.find(f=>f.key===e.field))+'）').join('，')+'。':'符合当前已知条件，可结合已保存参数继续比较取舍。';
  };
  const seen=new Set(),recommendations=[];
  const proposed=Array.isArray(proposal?.recommendations)?proposal.recommendations:[];
  for(const item of proposed.slice(0,6)){
    const candidate=frontier.find(c=>c.id===item.candidateId);
    if(!candidate||seen.has(candidate.id)){rejected++;continue;}
    const fields=[...new Set((Array.isArray(item.fields)?item.fields:[]).filter(key=>candidate.evidence.some(e=>e.field===key)))].slice(0,3);
    if(!fields.length){rejected++;continue;}
    const allowed=[...eligible.flatMap(c=>c.evidence.filter(e=>fields.includes(e.field)).flatMap(e=>numericTokens(e.quote+' '+e.value))),
      ...eligible.flatMap(c=>c.purchaseSources?[...c.purchaseSources.offers.filter(o=>o.comparable).flatMap(o=>[o.price,...(o.shipping!==null?[o.shipping,o.total]:[])]),c.purchaseSources.currentExtraCost].filter(v=>Number.isFinite(v)):[]),...Object.values(scenario.settings.limits).filter(v=>typeof v==='number')];
    const reason=proposal?.quoteComparison&&checkedPurchaseReason(candidate)|| (typeof item.reason==='string'&&item.reason.trim()&&item.reason.length<=240&&numericTokens(item.reason).every(n=>allowed.includes(n))?item.reason.trim():fallbackReason(candidate));
    recommendations.push({candidateId:candidate.id,reason,fields});seen.add(candidate.id);
    if(recommendations.length===2)break;
  }
  const acceptedCount=recommendations.length;
  if(!recommendations.length)for(const candidate of frontier.slice(0,2)){
    const fields=candidate.evidence.slice(0,3).map(e=>e.field);
    if(fields.length)recommendations.push({candidateId:candidate.id,reason:fallbackReason(candidate),fields});
  }
  const gaps=decisionGuidance(space,scenario,{limit:2}).investigations.map(task=>({candidateId:task.candidateId,fields:task.fieldKeys}));
  const names=recommendations.map(r=>space.candidates.find(c=>c.id===r.candidateId).name);
  const summary=names.length?'结合当前条件，可以先比较'+names.join('和')+'。':context.ranked.some(r=>r.status==='unresolved')?'当前还有关键依据不足，先核对信息再给出推荐。':'当前候选没有符合全部条件的方案，可以尝试其他假设或继续寻找资料。';
  const origin=space.mode==='demo'||proposal?.origin==='rules'?'rules':proposal?.origin==='recorded'?'recorded':acceptedCount?'model':'rules';
  return {version:1,scenarioId:scenario.id,basisKey:decisionBasisKey(space,scenario),origin,kind:'recommendation',summary,recommendations,gaps,rejectedSuggestions:rejected};
}

export function decisionAnswerText(answer,space){
  return answer.summary+(answer.recommendations.length?'\n\n'+answer.recommendations.map(r=>space.candidates.find(c=>c.id===r.candidateId).name+'：'+r.reason).join('\n'):'')+(answer.gaps.length?'\n\n仍需核对：'+answer.gaps.map(g=>space.candidates.find(c=>c.id===g.candidateId).name+'的'+g.fields.map(key=>space.schema.fields.find(f=>f.key===key).label).join('、')).join('；')+'。':'');
}
