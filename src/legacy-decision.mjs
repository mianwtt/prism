import {dimensions,factIssue} from './engine.mjs';
import {validateDecisionSchema,decisionScenarios} from './decision-schema.mjs';
// Read existing laptop snapshots without rerunning research or changing their sources.
// This is a historical data adapter, not the planner for new decisions.
export function adaptLegacyDecision(space){
  if(space.schema)return space;
  const result=structuredClone(space);
  result.schema=validateDecisionSchema({id:'imported',label:'已保存的选择',optionLabel:'方案',fields:Object.entries(dimensions).map(([key,d])=>({key,label:d.label,type:'number',unit:d.unit,direction:d.direction,range:{min:d.min,max:d.max},aliases:key==='price'?['预算']:[],step:key==='price'?1000:key==='memory'?16:key==='weight'?.2:1})),layout:{primaryField:'price',summaryFields:['memory','weight']},reason:'沿用这个空间已保存的比较维度和来源。'});
  result.schema.fields.find(f=>f.key==='price').conditionLabel='预算';
  const mapSettings=s=>({limits:{price:s.budget,memory:s.minMemory,weight:s.maxWeight,battery:null},weights:structuredClone(s.weights),...(s.calculationMode!=='provisional'?{evidenceMode:'reviewed'}:{})});
  result.settings=mapSettings(space.settings);result.baselineSettings=mapSettings(space.baselineSettings||space.settings);
  result.candidates=result.candidates.map(c=>({...c,sourceId:c.facts.price?.sourceId||null,facts:Object.fromEntries(Object.entries(c.facts).map(([key,f])=>[key,{...f,status:f.status==='confirmed'?'confirmed':f.status==='unreviewed'&&!factIssue(key,f)?'cited':'unknown'}]))}));
  const labels={cpu:'处理器',storageGB:'固态硬盘',os:'操作系统',screenResolution:'屏幕分辨率'};
  for(const c of result.candidates)c.displayDetails=Object.entries(c.productData?.fields||{}).filter(([key,f])=>labels[key]&&f?.value!==undefined).map(([key,f])=>({label:labels[key],value:String(f.value)+(key==='storageGB'?' GB':''),quote:f.quote,sourceId:f.sourceId}));
  result.scenarios=(space.scenarios||[]).map(s=>({...s,settings:mapSettings(s.settings)}));
  result.scenarios=decisionScenarios(result);result.activeScenarioId=space.activeScenarioId||'scenario-baseline';
  result.importedFromLegacy=true;return result;
}
