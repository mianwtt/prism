import {evaluateDecision,hasDecisionValue,formatDecisionValue} from './decision-schema.mjs';
import {factObservations} from './decision-workflow.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const usable=(fact,field,settings)=>hasDecisionValue(fact?.value,field)&&['cited','confirmed','example'].includes(fact?.status)&&!(settings.evidenceMode==='reviewed'&&fact.status==='cited');
export function compareDecisionBranches(space,left,right){
  if(!left?.settings||!right?.settings)throw new Error('请选择两条现有分支');
  const fields=space.schema.fields,allIds=space.candidates.map(c=>c.id);
  const pool=s=>space.candidates.filter(c=>(s.candidateIds||allIds).includes(c.id));
  const a=pool(left),b=pool(right),aIds=new Set(a.map(c=>c.id)),bIds=new Set(b.map(c=>c.id));
  const aRows=evaluateDecision(a,left.settings,space.schema),bRows=evaluateDecision(b,right.settings,space.schema);
  const aMap=new Map(aRows.map(r=>[r.id,r])),bMap=new Map(bRows.map(r=>[r.id,r]));
  const passed=rows=>rows.filter(r=>r.status==='eligible').map(r=>r.id),aPass=passed(aRows),bPass=passed(bRows);
  const scope={leftCount:a.length,rightCount:b.length,shared:allIds.filter(id=>aIds.has(id)&&bIds.has(id)),added:allIds.filter(id=>!aIds.has(id)&&bIds.has(id)),removed:allIds.filter(id=>aIds.has(id)&&!bIds.has(id))};
  scope.same=!scope.added.length&&!scope.removed.length;
  const conditions=fields.map(f=>({key:f.key,label:f.conditionLabel||f.label,field:f,left:left.settings.limits[f.key]??null,right:right.settings.limits[f.key]??null}));
  const weights=fields.map(f=>({key:f.key,label:f.label,left:left.settings.weights[f.key]??1,right:right.settings.weights[f.key]??1}));
  const conditionChanges=conditions.filter(r=>!same(r.left,r.right)),preferenceChanges=weights.filter(r=>r.left!==r.right);
  const evidenceModeChanged=(left.settings.evidenceMode||'cited')!==(right.settings.evidenceMode||'cited');
  function evidence(c,f){
    const fact=c.facts[f.key]||{},source=space.sources.find(s=>s.id===fact.sourceId);
    const observation=factObservations(space,c,f).find(o=>o.value===fact.value&&o.sourceId===fact.sourceId&&o.quote===fact.quote);
    return {value:hasDecisionValue(fact.value,f)?fact.value:null,quote:fact.quote||'',source:source?{id:source.id,title:source.title,url:source.url,retrievedAt:source.retrievedAt,kind:source.kind}:null,
      support:space.mode==='demo'&&fact.status==='example'?'example':observation?.verifiable?(fact.status==='confirmed'&&fact.confirmation==='user-reviewed'?'confirmed':'cited'):'unsupported',configuration:c.identity?.value||c.name};
  }
  function failures(c,s){
    const reasons=[];
    if(c.enabled===false)return [{kind:'disabled',message:'这条记录已暂停比较。'}];
    for(const f of fields){
      const limit=s.settings.limits[f.key]??null,needed=limit!==null||(s.settings.weights[f.key]??1)>0,fact=c.facts[f.key];
      if(!needed)continue;
      const ref=evidence(c,f),label=f.label;
      if(!usable(fact,f,s.settings)){
        const reviewOnly=s.settings.evidenceMode==='reviewed'&&fact?.status==='cited'&&hasDecisionValue(fact.value,f);
        reasons.push({kind:reviewOnly?'review':'missing',fieldKey:f.key,label,limit,evidence:ref,message:reviewOnly?`${label}有引用，尚未人工确认；这侧仅采用已确认参数。`:`${label}缺少可用于这侧计算的依据。`});continue;
      }
      if(limit===null)continue;
      const fails=f.type==='boolean'||f.type==='enum'?fact.value!==limit:f.direction===1?fact.value<limit:fact.value>limit;
      if(fails)reasons.push({kind:'condition',fieldKey:f.key,label,limit,evidence:ref,message:`${label}为 ${formatDecisionValue(fact.value,f)}，${f.type==='boolean'||f.type==='enum'?`不符合「${formatDecisionValue(limit,f)}」的要求`:`${f.direction===1?'低于':'高于'} ${formatDecisionValue(limit,f)} ${f.direction===1?'下限':'上限'}`}。`});
    }
    return reasons;
  }
  const records=space.candidates.filter(c=>aIds.has(c.id)||bIds.has(c.id)).map(c=>{
    const before=aMap.get(c.id),after=bMap.get(c.id),entered=after?.status==='eligible'&&before?.status!=='eligible',exited=before?.status==='eligible'&&after?.status!=='eligible';
    const category=entered?'entered':exited?'exited':before?.status==='eligible'&&after?.status==='eligible'?'retained':'other';
    let reasons=[];
    if(entered)reasons=before?failures(c,left):[{kind:'scope',message:'这条记录仅在右侧研究范围内，不能把它的进入全部归因于条件放宽。'}];
    else if(exited)reasons=after?failures(c,right):[{kind:'scope',message:'这条记录不在右侧研究范围内；这不表示它不满足右侧条件。'}];
    else if(category==='other')reasons=[...(before?failures(c,left):[]),...(after?failures(c,right):[])].filter((r,i,rs)=>rs.findIndex(x=>x.message===r.message)===i);
    else if(category==='retained'&&scope.same&&preferenceChanges.length)reasons=preferenceChanges.map(change=>{const f=fields.find(f=>f.key===change.key);return {kind:'preference',fieldKey:f.key,label:f.label,evidence:evidence(c,f),message:`${f.label}的采用值为 ${formatDecisionValue(c.facts[f.key]?.value,f)}，偏好权重 ${change.left} → ${change.right}。`};});
    const beforeRank=aPass.indexOf(c.id)+1,afterRank=bPass.indexOf(c.id)+1;
    return {id:c.id,name:c.name,media:c.media||null,category,leftStatus:before?.status||'outside-scope',rightStatus:after?.status||'outside-scope',reasons,
      rank:category==='retained'&&scope.same&&preferenceChanges.length?{left:beforeRank,right:afterRank}:null};
  });
  function distribution(candidates,settings,f){
    const rows=candidates.filter(c=>usable(c.facts[f.key],f,settings));
    const values=rows.map(c=>c.facts[f.key].value),numeric=(f.type||'number')==='number';
    const range=values.length?(numeric?{min:Math.min(...values),max:Math.max(...values)}:{values:[...new Set(values)].sort()}):null;
    const endpoints=numeric&&range?[range.min,range.max]:range?.values||[];
    return {count:rows.length,total:candidates.length,range,evidence:[...new Set(endpoints)].map(v=>{const c=rows.find(c=>c.facts[f.key].value===v);return {candidateId:c.id,candidateName:c.name,...evidence(c,f)};})};
  }
  const eligibleA=a.filter(c=>aPass.includes(c.id)),eligibleB=b.filter(c=>bPass.includes(c.id));
  const tradeoffs=fields.map(f=>({field:f,left:distribution(eligibleA,left.settings,f),right:distribution(eligibleB,right.settings,f)})).filter(r=>!same(r.left.range,r.right.range)&&(r.left.count||r.right.count));
  return {left:{id:left.id,name:left.name,eligibleCount:aPass.length},right:{id:right.id,name:right.name,eligibleCount:bPass.length},conditions,conditionChanges,weights,preferenceChanges,evidenceModeChanged,scope,records,tradeoffs,
    counts:Object.fromEntries(['entered','exited','retained','other'].map(category=>[category,records.filter(r=>r.category===category).length])),
    mode:scope.same?'recalculate':conditionChanges.length||preferenceChanges.length||evidenceModeChanged?'scope-and-settings':'scope',snapshot:{id:space.id||null,version:space.version||null,savedAt:space.savedAt||null,demo:space.mode==='demo'}};
}
