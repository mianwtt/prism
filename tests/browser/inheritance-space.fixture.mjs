import {validateDecisionSchema} from '../../src/decision-schema.mjs';
export function inheritanceFixture(){
 const schema=validateDecisionSchema({label:'软件测试用条件树',fields:[{key:'price',label:'价格',conditionLabel:'预算',unit:'元',direction:-1,step:1000},{key:'memory',label:'内存',unit:'GB',direction:1,step:16},{key:'weight',label:'重量',unit:'kg',direction:-1,step:.2}]});
 const settings={limits:{price:7000,memory:16,weight:2},weights:{price:1,memory:1,weight:1}};
 const rows=[['a','虚构电脑 A',5199,16,1.6],['b','虚构电脑 B',4688,16,1.9],['c','虚构电脑 C',6899,24,1.3]];
 const sources=rows.map(([id,name,price,memory,weight])=>({id:'source-'+id,title:name+' · 软件测试虚构资料',kind:'fixture',url:null,retrievedAt:'2026-11-09T00:00:00.000Z',text:`${name}，价格${price}元，内存${memory}GB，重量${weight}kg。所有数据为软件测试虚构资料。`}));
 const candidates=rows.map(([id,name,price,memory,weight],i)=>({id,name,sourceId:sources[i].id,facts:Object.fromEntries(Object.entries({price,memory,weight}).map(([key,value])=>[key,{value,status:'example',sourceId:sources[i].id,quote:sources[i].text}]))}));
 const branch=(id,parent,name,changes)=>({id,parentScenarioId:parent,name,settings:{...structuredClone(settings),limits:{...settings.limits,price:8000,...changes}},candidateIds:['a','b','c']});
 const scenarios=[branch('expanded','scenario-baseline','预算放宽到8000元',{}),branch('budget','expanded','预算收紧到5000元',{price:5000}),branch('light','budget','更轻一点',{price:5000,weight:1.7}),branch('memory','expanded','内存至少24GB',{memory:24}),branch('recovery','memory','24GB并且更轻',{memory:24,weight:1.5})];
 return {title:'条件继承 · 虚构软件测试',question:'预算7000元，内存至少16GB，重量不超过2kg。',mode:'demo',schema,settings,baselineSettings:structuredClone(settings),baselineCandidateIds:['a','b'],candidates,sources,scenarios,canvasScenarioIds:['scenario-baseline',...scenarios.map(s=>s.id)],activeScenarioId:'expanded'};
}
