// The agent supplies the dimensions. This module validates data, never chooses a domain template.
import {convertQuantity} from './decision-evidence.mjs';
export function validateDecisionSchema(raw) {
  if(!raw||!Array.isArray(raw.fields)||raw.fields.length<1||raw.fields.length>8)throw new Error('比较维度应为 1–8 项');
  const ids=new Set();
  const fields=raw.fields.map(f=>{
    if(!f||!/^([a-z][a-zA-Z0-9_]{0,30})$/.test(f.key)||['constructor','prototype','__proto__'].includes(f.key)||ids.has(f.key))throw new Error('比较维度标识无效：使用字母开头的英文、数字或下划线，且不能重复');
    ids.add(f.key);
    const type=f.type||'number',unit=f.unit||'',direction=type!=='number'&&f.direction===0?1:f.direction??1;
    if(!['number','boolean','enum'].includes(type)||typeof f.label!=='string'||!f.label.trim()||f.label.length>20||typeof unit!=='string'||unit.length>16||![1,-1].includes(direction))throw new Error('比较维度需要名称、单位和偏好方向');
    const options=type==='enum'?(Array.isArray(f.options)?[...new Set(f.options.filter(x=>typeof x==='string'&&x.length>0&&x.length<=30))].slice(0,12):[]):[];
    if(type==='enum'&&options.length<2)throw new Error('分类维度需要至少两个选项');
    const preferred=type==='boolean'&&typeof f.preferred==='boolean'?f.preferred:type==='enum'&&options.includes(f.preferred)?f.preferred:null;
    const range=Number.isFinite(f.range?.min)&&Number.isFinite(f.range?.max)&&f.range.max>f.range.min?{min:f.range.min,max:f.range.max}:null;
    return {key:f.key,label:f.label.trim(),conditionLabel:typeof f.conditionLabel==='string'&&f.conditionLabel.trim()?f.conditionLabel.trim().slice(0,20):f.label.trim(),type,unit,direction,preferred,options,range,step:Number.isFinite(f.step)&&f.step>0?f.step:1,aliases:(Array.isArray(f.aliases)?f.aliases:[]).filter(x=>typeof x==='string'&&x.length>0&&x.length<=20).slice(0,6),reason:typeof f.reason==='string'?f.reason.slice(0,160):''};
  });
  const primaryField=ids.has(raw.layout?.primaryField)?raw.layout.primaryField:fields[0].key;
  const summaryFields=Array.isArray(raw.layout?.summaryFields)?raw.layout.summaryFields.filter(k=>ids.has(k)&&k!==primaryField).slice(0,4):fields.filter(f=>f.key!==primaryField).slice(0,3).map(f=>f.key);
  return {id:typeof raw.id==='string'?raw.id.slice(0,40):'adaptive',label:typeof raw.label==='string'?raw.label.slice(0,30):'选择比较',optionLabel:typeof raw.optionLabel==='string'?raw.optionLabel.slice(0,12):'方案',fields,layout:{primaryField,summaryFields},reason:typeof raw.reason==='string'?raw.reason.slice(0,300):''};
}
export function validateDecisionSettings(raw,schema) {
  const limits={},weights={};
  for(const f of schema.fields){
    const v=raw?.limits?.[f.key];
    if(v!==null&&v!==undefined&&((f.type||'number')==='number'?(!Number.isFinite(v)||v<0||v>1e9):f.type==='boolean'?typeof v!=='boolean':!f.options.includes(v)))throw new Error(`${f.label}条件无效`);
    limits[f.key]=v??null;
    const w=raw?.weights?.[f.key]??1;
    if(!Number.isFinite(w)||w<0||w>100)throw new Error('偏好值需要在 0–100 之间');
    weights[f.key]=w;
  }
  if(!Object.values(weights).some(x=>x>0))throw new Error('至少保留一项比较偏好');
  return {limits,weights,...(raw?.evidenceMode==='reviewed'?{evidenceMode:'reviewed'}:{})};
}
const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Vocabulary comes from an already validated user-quoted field binding, never a
// fixed list of product/rental labels or an untrusted source-page instruction.
export function rememberConditionAlias(schema,key,quote){
  const field=schema.fields.find(field=>field.key===key);if(!field||typeof quote!=='string')return;
  const match=/(?:^|[，,。；;])\s*(?:(?:如果|那|请|先|把|将|现在|希望|要求)\s*)*([\p{L}][\p{L}\s]{1,14}?)\s*(?:(?:再)?(?:改为|改成|调整为|调整到|设为|增加|减少|提高|降低|放宽到|收紧到)|不超过|不少于|不低于|不高于|至少|最多|上限|下限|≤|≥)\s*\d/u.exec(quote);
  const alias=match?.[1].trim();if(!alias||alias.length>20||schema.fields.some(other=>other.key!==key&&[other.label,other.conditionLabel,...(other.aliases||[])].includes(alias)))return;
  field.aliases=[...new Set([alias,...(field.aliases||[])])].slice(0,6);
}
export function parseDecisionChange(text,settings,schema) {
  const next=structuredClone(settings),changed=[],specified=[],ranges=[];
  for(const f of schema.fields){
    const names=[...new Set([f.label,f.conditionLabel,f.label.replace(/\s*[(（][^()（）]*[)）]\s*$/,''),...(f.aliases||[])].filter(Boolean))].sort((a,b)=>b.length-a.length).map(escapeRE).join('|');
    if(f.type==='boolean'||f.type==='enum'){
      const match=[...text.matchAll(new RegExp(`(?:${names})`,'g'))].at(-1);
      if(!match)continue;
      const prefix=text.slice(0,match.index).split(/[，,。；;]/).at(-1).slice(-5);
      const segment=prefix+text.slice(match.index,match.index+match[0].length+35).split(/[，,。；;]/)[0];
      let value=/不限|不限制|无要求/.test(segment)?null:f.type==='boolean'?!/不能|不允许|不支持|禁止|不要|无需|不需要/.test(segment):f.options.find(x=>segment.includes(x));
      if(value!==undefined){specified.push(f.key);if(value!==next.limits[f.key]){next.limits[f.key]=value;changed.push(f.key);}}continue;
    }
    const verbs='增加|减少|提高|降低|放宽|收紧|上调|下调|缩短|延长|加|减|升|降';
    const targets='调整到|调整为|设置为|控制在|改为|改成|设为|至少|不超过|不少于|不高于|最多|上限|下限|要求|至|到|为|≥|≤';
    const number='(?:\\d{1,3}(?:[,，]\\d{3})+|\\d+)(?:\\.\\d+)?';
    const unit='(?:kg\\b|千克|公斤|GB\\b|TB\\b|g\\b|克|分钟|min\\b|小时|h\\b|万元|万|元(?:/月)?|CNY\\b|㎡|平方米|平米|m²|m2\\b)';
    const range=new RegExp(`(?:(?:${verbs})\\s*)?(?:${names})\\s*(?:(?:${verbs})\\s*)?(?:${targets}|在|介于)?\\s*${number}\\s*${unit}?\\s*(?:[-~～–—]|至|到)\\s*${number}\\s*${unit}?`,'i').exec(text);
    if(range){ranges.push({field:f.key,quote:range[0]});continue;}
    const re=new RegExp(`(?:(?:再\\s*)?(?<before>${verbs})\\s*)?(?:${names})\\s*(?:(?:再\\s*)?(?<after>${verbs})\\s*)?(?<target>${targets})?\\s*(?<amount>${number})`,'i');
    let m=re.exec(text);
    if(!m&&/^(?:㎡|m2|m²|平米|平方米)$/.test(f.unit))m=/(\d+(?:\.\d+)?)\s*(?:㎡|平方米|平米|m²|m2)/i.exec(text);
    if(!m)continue;
    // Negation and ranges do not establish a single executable target.
    const prefix=text.slice(0,m.index).split(/[，,。；;]/).at(-1);
    if(/(?:不要|别|无需|不需要|不想|不必|不再)\s*(?:把|将)?\s*$/.test(prefix))continue;
    const suffix=text.slice(m.index+m[0].length);
    if(/^\s*(?:[-~～–]|至|到)\s*\d/.test(suffix))continue;
    let value=Number((m.groups?.amount??m[1]).replace(/[,，]/g,''));
    const explicitUnit=/^\s*(kg\b|千克|公斤|GB\b|TB\b|g\b|克|分钟|min\b|小时|h\b|万元|万|元|CNY\b|㎡|平方米|平米|m²|m2\b)/i.exec(suffix)?.[1];
    if(explicitUnit){const converted=convertQuantity(value,explicitUnit,f.unit==='元/月'?'元':f.unit);if(converted===null)continue;value=converted;}
    const relative=!m.groups?.target&&(m.groups?.after||m.groups?.before);
    if(relative){
      if(/^\s*(?:kg\b|千克|公斤|GB\b|TB\b|g\b|克|分钟|min\b|小时|h\b|万元|万|元|CNY\b)?\s*(?:以内|以下|以上)/i.test(suffix))continue;
      if(next.limits[f.key]===null)throw new Error(`请先给出${f.label}的具体数值`);
      const direction=relative==='放宽'?-f.direction:relative==='收紧'?f.direction:/减少|减|降低|下调|缩短|降/.test(relative)?-1:1;
      value=next.limits[f.key]+direction*value;
    }
    specified.push(f.key);
    if(value!==next.limits[f.key])changed.push(f.key);
    next.limits[f.key]=value;
  }
  return {settings:validateDecisionSettings(next,schema),changed,specified,ranges};
}
export const hasDecisionValue=(value,field)=>(field.type||'number')==='number'?Number.isFinite(value):field.type==='boolean'?typeof value==='boolean':field.options.includes(value);
export const formatDecisionValue=(value,field)=>value===null||value===undefined?'不限':field.type==='boolean'?(value?'是':'否'):field.type==='enum'?String(value):`${Number(value).toLocaleString('zh-CN')}${field.unit}`;
export function summarizeConditions(settings,schema) {
  return schema.fields.filter(f=>settings.limits[f.key]!==null).map(f=>`${f.label}${(f.type||'number')==='number'?(f.direction===1?' ≥ ':' ≤ '):'：'}${formatDecisionValue(settings.limits[f.key],f)}`).join(' · ')||'尚未设置硬性条件';
}
export function evaluateDecision(candidates,settings,schema) {
  const valid=validateDecisionSettings(settings,schema),total=Object.values(valid.weights).reduce((a,b)=>a+b,0);
  const ranges=Object.fromEntries(schema.fields.map(f=>{const nums=candidates.map(c=>c.facts[f.key]?.value).filter(Number.isFinite);return [f.key,[Math.min(...nums),Math.max(...nums)]];}));
  return candidates.map(c=>{
    const reasons=[],missing=[];let score=0;
    for(const f of schema.fields){
      const fact=c.facts[f.key],v=fact?.value,needed=valid.limits[f.key]!==null||valid.weights[f.key]>0;
      if(!hasDecisionValue(v,f)||!['cited','confirmed','example'].includes(fact?.status)||(valid.evidenceMode==='reviewed'&&fact?.status==='cited')){if(needed)missing.push(f.label);continue;}
      const limit=valid.limits[f.key];
      if(f.type==='boolean'||f.type==='enum'){
        if(limit!==null&&v!==limit)reasons.push(`${f.label}不符合要求`);
        const preferred=limit??f.preferred;score+=(preferred===null?0.5:v===preferred?1:0)*valid.weights[f.key]/total*100;continue;
      }
      if(limit!==null&&(f.direction===1?v<limit:v>limit))reasons.push(`${f.label}${f.direction===1?'低于下限':'超过上限'}`);
      const [lo,hi]=f.range?[f.range.min,f.range.max]:ranges[f.key],norm=hi===lo ? 0.5 : Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
      score+=(f.direction===1?norm:1-norm)*valid.weights[f.key]/total*100;
    }
    return {id:c.id,name:c.name,status:c.enabled===false?'disabled':reasons.length?'excluded':missing.length?'unresolved':'eligible',score,reasons,missing};
  }).sort((a,b)=>({eligible:0,unresolved:1,excluded:2,disabled:3}[a.status]-{eligible:0,unresolved:1,excluded:2,disabled:3}[b.status]||b.score-a.score||a.id.localeCompare(b.id)));
}
export function decisionScenarios(space) {
  const baseline={id:'scenario-baseline',name:'当前情况',settings:structuredClone(space.baselineSettings||space.settings),candidateIds:[...(space.baselineCandidateIds||space.candidates.map(c=>c.id))]};
  return resolveScenarioInheritance([baseline,...(space.scenarios||[]).filter(s=>s.id!==baseline.id).map(s=>structuredClone(s))],space.schema);
}
const sameSetting=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function overrideMask(raw,schema){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('分支条件继承信息无效');
  const keys=new Set(schema.fields.map(f=>f.key)),result={};
  for(const group of ['limits','weights']){
    const list=raw[group]??[];
    if(!Array.isArray(list)||list.length>schema.fields.length||list.some(key=>!keys.has(key)))throw new Error('分支条件继承信息包含无效维度');
    result[group]=[...new Set(list)];
  }
  if(raw.evidenceMode!==undefined&&typeof raw.evidenceMode!=='boolean')throw new Error('分支依据继承信息无效');
  result.evidenceMode=raw.evidenceMode===true;return result;
}
function inferMask(branch,parent,schema){
  return {limits:schema.fields.filter(f=>!sameSetting(branch.settings.limits[f.key],parent.settings.limits[f.key])).map(f=>f.key),weights:schema.fields.filter(f=>!sameSetting(branch.settings.weights[f.key],parent.settings.weights[f.key])).map(f=>f.key),evidenceMode:(branch.settings.evidenceMode||'cited')!==(parent.settings.evidenceMode||'cited')};
}
// Branches own only explicit overrides. Inherited values follow their parent even
// after a later parent edit happens to equal an override's value temporarily.
export function resolveScenarioInheritance(raw,schema,{previous=[]}={}){
  const branches=structuredClone(raw),byId=new Map(branches.map(s=>[s.id,s])),old=new Map(previous.map(s=>[s.id,s])),done=new Set(),visiting=new Set();
  const baseline=byId.get('scenario-baseline')||branches[0];if(!baseline)return branches;
  function resolve(branch){
    if(done.has(branch.id))return branch;
    if(visiting.has(branch.id))throw new Error('分支不能形成循环');visiting.add(branch.id);
    branch.settings=validateDecisionSettings(branch.settings,schema);
    if(branch.id!==baseline.id){
      const parent=byId.get(branch.parentScenarioId||baseline.id);if(!parent)throw new Error('分支来源不存在');resolve(parent);
      const prior=old.get(branch.id),priorParent=prior&&old.get(prior.parentScenarioId||baseline.id);
      const supplied=branch.overrides,mask=overrideMask(supplied??prior?.overrides??inferMask(prior&&priorParent?prior:branch,priorParent||parent,schema),schema);
      // Older clients may post a direct edit without updating the intent mask.
      // An unchanged descendant value is never treated as a new override.
      if(prior)for(const group of ['limits','weights'])for(const f of schema.fields){
        if(sameSetting(branch.settings[group][f.key],prior.settings[group][f.key]))continue;
        if(!sameSetting(branch.settings[group][f.key],parent.settings[group][f.key])){if(!mask[group].includes(f.key))mask[group].push(f.key);}
        else if(!supplied?.[group]?.includes(f.key))mask[group]=mask[group].filter(key=>key!==f.key);
      }
      if(prior&&(branch.settings.evidenceMode||'cited')!==(prior.settings.evidenceMode||'cited'))mask.evidenceMode=(branch.settings.evidenceMode||'cited')!==(parent.settings.evidenceMode||'cited')||supplied?.evidenceMode===true;
      for(const group of ['limits','weights'])for(const f of schema.fields)if(!mask[group].includes(f.key))branch.settings[group][f.key]=parent.settings[group][f.key];
      if(!mask.evidenceMode){if(parent.settings.evidenceMode)branch.settings.evidenceMode=parent.settings.evidenceMode;else delete branch.settings.evidenceMode;}
      branch.settings=validateDecisionSettings(branch.settings,schema);branch.overrides=mask;
    }
    visiting.delete(branch.id);done.add(branch.id);return branch;
  }
  branches.forEach(resolve);return branches;
}
export function changeScenarioSettings(raw,id,settings,schema,{overrides}={}){
  const branches=resolveScenarioInheritance(raw,schema),target=branches.find(s=>s.id===id);
  if(!target||target.id==='scenario-baseline')throw new Error('当前情况保持固定，请先建立新分支');
  const before=new Map(branches.map(s=>[s.id,structuredClone(s.settings)])),parent=branches.find(s=>s.id===(target.parentScenarioId||'scenario-baseline'))||branches[0],next=validateDecisionSettings(settings,schema);
  const mask=overrideMask(overrides??target.overrides,schema);
  if(overrides===undefined){
    for(const group of ['limits','weights'])for(const f of schema.fields)if(!sameSetting(next[group][f.key],target.settings[group][f.key])){
      mask[group]=mask[group].filter(key=>key!==f.key);if(!sameSetting(next[group][f.key],parent.settings[group][f.key]))mask[group].push(f.key);
    }
    if((next.evidenceMode||'cited')!==(target.settings.evidenceMode||'cited'))mask.evidenceMode=(next.evidenceMode||'cited')!==(parent.settings.evidenceMode||'cited');
  }
  target.settings=next;target.overrides=mask;
  const result=resolveScenarioInheritance(branches,schema);
  return {scenarios:result,changedIds:result.filter(s=>!sameSetting(before.get(s.id),s.settings)).map(s=>s.id)};
}
export function validateDecisionScenarios(space,raw) {
  if(!Array.isArray(raw)||raw.length>24)throw new Error('最多保存 24 个情景');
  const previous=decisionScenarios(space),baseline=previous[0],seen=new Set([baseline.id]),scenarios=[baseline];
  for(const s of raw){
    if(s.id===baseline.id)continue;
    if(typeof s.id!=='string'||!/^[-a-zA-Z0-9]{1,60}$/.test(s.id)||seen.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>80)throw new Error('情景名称或标识无效');
    seen.add(s.id);
    const prior=space.scenarios?.find(x=>x.id===s.id);
    const candidateIds=[...(prior?.candidateIds||space.candidates.map(c=>c.id))];
    const preview=s.previewCandidateId??prior?.previewCandidateId;
    if(preview!==undefined&&(!candidateIds.includes(preview)||!space.candidates.some(c=>c.id===preview)))throw new Error('请选择该分支内已有的方案');
    const parentScenarioId=s.parentScenarioId??prior?.parentScenarioId??baseline.id;
    scenarios.push({id:s.id,parentScenarioId,name:s.name.trim(),settings:validateDecisionSettings(s.settings,space.schema),candidateIds,...(s.overrides!==undefined?{overrides:overrideMask(s.overrides,space.schema)}:{}),...(preview?{previewCandidateId:preview}:{}),...(prior?.suggestedBy?{suggestedBy:prior.suggestedBy}:{}),...(prior?.research?{research:structuredClone(prior.research)}:{})});
  }
  if(scenarios.length>24)throw new Error('最多保存 24 个情景');
  for(const branch of scenarios.slice(1)){
    const visited=new Set([branch.id]);let parent=branch.parentScenarioId;
    while(parent&&parent!==baseline.id){
      if(visited.has(parent))throw new Error('分支不能形成循环');visited.add(parent);
      const node=scenarios.find(s=>s.id===parent);if(!node)throw new Error('分支来源不存在');parent=node.parentScenarioId;
    }
  }
  function inheritedScope(branch){
    if(branch.id===baseline.id||space.scenarios?.some(s=>s.id===branch.id))return branch.candidateIds;
    return inheritedScope(scenarios.find(s=>s.id===branch.parentScenarioId)||baseline);
  }
  for(const branch of scenarios.slice(1)){
    branch.candidateIds=[...inheritedScope(branch)];
    if(branch.previewCandidateId&&!branch.candidateIds.includes(branch.previewCandidateId))throw new Error('请选择该分支内已有的方案');
  }
  return resolveScenarioInheritance(scenarios,space.schema,{previous});
}
