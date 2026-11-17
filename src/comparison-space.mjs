import {defaultSettings} from './engine.mjs';
function displayName(p){
 const name=p.name.replace(/^\s*苏选自营\s*/,'').trim();
 if(/异能者/.test(name))return '联想生态品牌 · 异能者 '+(p.attributes['型号']?.value||'');
 if(/戴尔|DELL/i.test(name))return '戴尔 '+(p.attributes['型号']?.value||p.attributes['系列']?.value||name);
 if(/华硕|ASUS/i.test(name))return '华硕 '+(p.attributes['型号']?.value||p.attributes['系列']?.value||name);
 if(/惠普|\bHP\b/i.test(p.name))return `惠普 星Book ${/14/.test(p.identity.manufacturerPartNumber||'')?'14':'16'}${p.identity.manufacturerPartNumber?' · '+p.identity.manufacturerPartNumber:''}`;
 if(/联想|Lenovo|ThinkPad|ThinkBook|YOGA/i.test(p.name))return '联想 '+(p.attributes['型号']?.value||p.attributes['系列']?.value||name);
 return p.name;
}
export function createComparisonSpace(dataset){
 const products=dataset.comparisonReady||[];
 if(!products.length)throw Error('没有核心字段完整的商品，不能创建比较空间');
 const sources=products.flatMap(p=>structuredClone(p.sources));
 const candidates=products.map(p=>{
  const facts={};
  for(const [key,fieldKey]of [['price','priceCNY'],['memory','memoryGB'],['weight','weightKg']]){
   const f=p.fields[fieldKey];
   if(!f||!sources.some(s=>s.id===f.sourceId&&s.text.includes(f.quote)))throw Error(p.id+' 引文不匹配');
   facts[key]={...f,status:'unreviewed',...(key==='price'?{priceKind:'merchant-listed'}:{})};
  }
  facts.battery={value:null,status:'unknown',quote:'',sourceId:null,reviewReason:'当前保存的商品规格未披露续航小时；未参与评分'};
  if(p.runtimeHours?.value)facts.battery={...p.runtimeHours,status:'unreviewed'};
  const image=p.images?.[0],source=sources.find(s=>s.id===p.fields.memoryGB.sourceId);
  if(image&&source)source.image={...image};
  const seller=p.sources.map(s=>s.text.match(/(?:^|\n)([^\n]{2,40}(?:旗舰店|专营店|专卖店))(?:\n|$)/)?.[1]).find(Boolean)||'苏宁商品页';
  return {id:p.id,name:displayName(p),proposedName:p.name,tag:p.fields.cpu.value,facts,
   productData:structuredClone(p),seller,
   ...(image&&source?{media:{...image,sourceId:source.id,label:'商品来源页配图'}}:{})};
 });
 const settings={...structuredClone(defaultSettings),budget:7000,calculationMode:'provisional',weights:{price:35,memory:25,weight:30,battery:0}};
 return {title:'开发笔记本：更轻，还是更省？',question:'预算 7000 元，至少 16GB 内存。在真实商品报价与便携性之间，找到适合自己的取舍。',mode:'live',settings,candidates,sources,
  comparisonData:structuredClone(dataset),
  scenarios:[{id:'scenario-baseline',name:'原始条件',settings:structuredClone(settings)},
   {id:'scenario-budget',name:'预算收紧到 5000 元',settings:{...structuredClone(settings),budget:5000}},
   {id:'scenario-commute',name:'通勤：重量不超过 1.7 kg',settings:{...structuredClone(settings),maxWeight:1.7}}],
  trace:products.map(p=>({type:'collection',node:'extract',message:`已整理 ${p.name}：页面报价与七项核心字段，原文已保存`,at:p.sources[0].retrievedAt})),
  warnings:['本空间基于公开商品页面引用进行试算，未经独立硬件实测；两款商品均来自苏宁，尚未完成跨平台核对。']};
}
