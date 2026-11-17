import { factIssue, dimensions } from "./engine.mjs";
const identity=name=>name.toLowerCase().replace(/[\s·+._/()（）-]/g, "");
export function supplementQuestion(previous) {
  const targets=previous.candidates.filter(c=>c.enabled!==false).slice(0,3).map(c=>{
    const missing=Object.entries(dimensions).filter(([key])=>factIssue(key,c.facts[key])).map(([,d])=>d.label);
    return `${c.proposedName||c.originalName||c.name}：待补充 ${missing.join("、")||"独立来源核对"}`;
  });
  return `继续这项笔记本研究。原始问题：${previous.question}\n当前条件：预算${previous.settings.budget}元，内存至少${previous.settings.minMemory}GB，重量不超过${previous.settings.maxWeight}kg。\n已发现的具体候选：\n${targets.join("\n")}\n请逐个补搜上述候选的缺失参数，优先具体配置的官方规格与实际报价。不要只反复搜索一个型号。不同配置、补贴资格和起售价不能混用；找不到则保留未知。`.slice(0,2000);
}
export function supplementQueries(previous) {
  return previous.candidates.filter(c=>c.enabled!==false).slice(0,3).map(c=>{
    const missing=Object.entries(dimensions).filter(([key])=>factIssue(key,c.facts[key])).map(([,d])=>d.label);
    const name=(c.originalName||c.name).replace(/\s*[(（][^()（）]*[)）]/g, "");
    return `${name} 具体配置 ${missing.join(" ")||"价格 内存 重量"} 官网 参数 报价`.slice(0,500);
  });
}
export function mergeSupplement(previous, research, key) {
  const result=structuredClone(research), sourceMap=new Map(result.sources.map(s=>[s.id,`research-${key.slice(0,8)}-${s.id}`]));
  function relink(value) {
    if(Array.isArray(value))return value.map(relink);
    if(!value||typeof value!=="object")return value;
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,(k==="sourceId"||k==="id")&&sourceMap.has(v)?sourceMap.get(v):relink(v)]));
  }
  result.candidates=result.candidates.map(relink);
  if(result.comparisonData)result.comparisonData=relink(result.comparisonData);
  result.sources=result.sources.map(s=>({...s,id:sourceMap.get(s.id)}));
  const candidates=structuredClone(previous.candidates), warnings=[...(previous.warnings||[]),...(result.warnings||[])];
  for(const incoming of result.candidates) {
    const prior=candidates.find(c=>identity(c.proposedName||c.originalName||c.name)===identity(incoming.proposedName||incoming.name));
    if(!prior) {
      if(candidates.length<12)candidates.push({...incoming,id:`candidate-${key.slice(0,8)}-${incoming.id}`});
      else warnings.push("候选已达 12 个，新增线索保留在研究来源中，未挤掉原有方案。");
      continue;
    }
    for(const field of Object.keys(dimensions)) {
      const old=prior.facts[field],fresh=incoming.facts[field];
      if(old.confirmation==="user-assumption")continue;
      if(old.status==="confirmed" && old.value!==null && fresh.value!==null && old.value!==fresh.value) {
        prior.facts[field]={value:null,status:"unknown",sourceId:null,quote:"",reviewReason:"补充来源与原确认值不一致，需核对配置及时间",conflictingEvidence:[old,fresh],evidence:[old,fresh]};
      } else if(fresh.value!==null && old.status!=="confirmed")prior.facts[field]=fresh;
      else if(old.status!=="confirmed" && factIssue(field,old))prior.facts[field]={...fresh,previousObservation:old};
    }
    if(incoming.media)prior.media=incoming.media;
    if(incoming.priceObservations)prior.priceObservations=incoming.priceObservations;
    if(incoming.productData)prior.productData=incoming.productData;
    if(incoming.seller)prior.seller=incoming.seller;
  }
  return {...previous,candidates,comparisonData:result.comparisonData||previous.comparisonData,sources:[...previous.sources,...result.sources],warnings,
    trace:[...(previous.trace||[]),...(result.trace||[])],agent:result.agent,
    coverage:undefined,supplement:{at:new Date().toISOString(),jobId:key,newPages:result.sources.length}};
}
