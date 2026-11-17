import {decisionScenarios,validateDecisionSchema,validateDecisionSettings,validateDecisionScenarios} from './decision-schema.mjs';
import {reviewDecisionFacts,captureDecision} from './decision-workflow.mjs';
// A fixed fictional fixture only. Live planning never imports or uses these fields.
export function housingContract(question=''){
  const sale=/买房|购房/.test(question);
  const schema=validateDecisionSchema({id:'housing',label:sale?'购房选择':'租房选择',optionLabel:'房源',fields:[{key:'price',label:sale?'总价':'月租',unit:sale?'万元':'元/月',direction:-1,aliases:['租金','预算'],step:500},{key:'area',label:'面积',unit:'㎡',direction:1,aliases:[],step:10},{key:'commute',label:'通勤',unit:'分钟',direction:-1,aliases:[],step:10}]});
  return {schema,settings:validateDecisionSettings({limits:{price:4000,area:30,commute:45}},schema)};
}
export function editGeneralSpace(previous,input) {
  const next=reviewDecisionFacts(previous,input.reviews||[]);
  next.baselineSettings??=structuredClone(previous.settings);
  next.baselineCandidateIds??=previous.candidates.map(c=>c.id);
  next.scenarios=validateDecisionScenarios(previous,input.scenarios||decisionScenarios(previous));
  const selected=next.scenarios.find(s=>s.id===(input.activeScenarioId||previous.activeScenarioId))||next.scenarios[0];
  next.activeScenarioId=selected.id;
  if(input.canvasScenarioIds!==undefined){
    if(!Array.isArray(input.canvasScenarioIds)||input.canvasScenarioIds.length>24||input.canvasScenarioIds.some(id=>!next.scenarios.some(s=>s.id===id)))throw new Error('画布分支无效');
    next.canvasScenarioIds=[...new Set(input.canvasScenarioIds)];
  }
  next.settings=validateDecisionSettings(selected.settings,next.schema);
  if(input.candidateEdits?.length)throw new Error('此空间的新方案请通过补充研究更新');
  if(input.decision!==undefined){
    next.decision=captureDecision(next,input.decision,selected);
  }
  return next;
}
export function housingDemo(){
  const question='在杭州租房，月租预算 4000 元，面积至少 30 平米，通勤不超过 45 分钟。比较租金、空间和通勤的取舍。';
  const {schema,settings}=housingContract(question);
  const rows=[['沿河一居',3200,32,42],['地铁旁一居',3900,40,25],['近公司两居',4600,58,15],['远郊大两居',3500,62,60]];
  const sources=rows.map(([name,price,area,commute],i)=>({id:'housing-example-'+i,title:name+' · 虚构演示',kind:'fixture',url:null,text:`${name}，月租 ${price} 元/月，面积 ${area} ㎡，单程通勤 ${commute} 分钟。所有数据为虚构示例，不对应真实挂牌或实测路线。`,retrievedAt:new Date().toISOString()}));
  const candidates=rows.map(([name,price,area,commute],i)=>({id:'housing-'+i,name,sourceId:sources[i].id,enabled:true,displayDetails:[{label:'户型',value:i<2?'一室一厅':'两室一厅',sourceId:sources[i].id},{label:'通勤口径',value:'单程时间，虚构演示值，未调用地图测量',sourceId:sources[i].id}],facts:Object.fromEntries(Object.entries({price,area,commute}).map(([key,value])=>[key,{value,status:'example',quote:sources[i].text,sourceId:sources[i].id}]))}));
  const space={title:'住得更近，还是住得更宽敞？',question,mode:'demo',schema,settings,baselineSettings:structuredClone(settings),baselineCandidateIds:candidates.map(c=>c.id),candidates,sources,trace:[],warnings:[],activeScenarioId:'scenario-baseline'};
  space.scenarios=decisionScenarios(space);
  return space;
}
