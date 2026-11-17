import test from 'node:test';
import assert from 'node:assert/strict';
import {planDecision,runGeneralResearch} from '../src/general-research.mjs';
import {validateDecisionSchema,evaluateDecision} from '../src/decision-schema.mjs';
import {adaptLegacyDecision} from '../src/legacy-decision.mjs';
import {demoSpace} from '../src/demo.mjs';
import {evaluate} from '../src/engine.mjs';

test('same subject accepts entirely different agent-selected criteria, including boolean and enum values',async()=>{
  const a=await planDecision('找住房，我只关心养宠和采光。允许养宠，采光要充足。',{model:async()=>({schema:{label:'带猫找到采光好的住处',optionLabel:'住处',reason:'你的优先级是养宠和采光，而非面积或通勤。',fields:[{key:'pets',label:'允许养宠',type:'boolean',aliases:['养宠'],preferred:true},{key:'daylight',label:'采光',type:'enum',options:['充足','一般','不足']}],layout:{primaryField:'daylight',summaryFields:['pets']}},queries:['宠物友好 明亮住房']})});
  assert.deepEqual(a.schema.fields.map(f=>f.key),['pets','daylight']);
  assert.deepEqual(a.settings.limits,{pets:true,daylight:'充足'});
  assert.equal(a.schema.layout.primaryField,'daylight');
  const b=await planDecision('同样是住房，我要比较租约灵活性和隔音。',{model:async()=>({schema:{fields:[{key:'lease',label:'租约灵活',type:'boolean'},{key:'noise',label:'隔音',type:'enum',options:['好','一般','差']}],layout:{primaryField:'noise'}}})});
  assert.deepEqual(b.schema.fields.map(f=>f.key),['lease','noise']);
  assert.equal(b.schema.fields.some(f=>/租金|面积|通勤/.test(f.label)),false);
});
test('new concern extends the live schema, changes layout, and leaves current situation facts, criteria and result intact',async()=>{
  const base=adaptLegacyDecision(demoSpace());base.mode='live';const snapshot=structuredClone(base);
  const revised=validateDecisionSchema({...base.schema,fields:[...base.schema.fields,{key:'quiet',label:'安静',type:'boolean',preferred:true,reason:'你新增的关注点'}],layout:{primaryField:'quiet',summaryFields:['price']}});
  const io={search:async()=>[],model:async()=>({schema:revised,constraints:[{field:'quiet',value:true,quote:'需要安静'}],queries:['安静 具体方案']})};
  const result=await runGeneralResearch(base.question,io,()=>{},{previous:base,scenario:base.scenarios[0],scenarios:base.scenarios,adaptation:'还需要安静'});
  assert.equal(result.schema.layout.primaryField,'quiet');
  assert.equal(result.schema.fields.at(-1).type,'boolean');
  assert.equal(result.baselineSettings.limits.quiet,null);assert.equal(result.baselineSettings.weights.quiet,0);
  assert.equal(result.scenarios.at(-1).settings.limits.quiet,true);
  assert.equal(result.scenarios.at(-1).name,'还需要安静');
  assert.equal(evaluateDecision(result.candidates,result.baselineSettings,result.schema)[0].id,evaluateDecision(base.candidates,base.baselineSettings,base.schema)[0].id);
  assert.deepEqual(base,snapshot);
});
test('schema plans repair once, never fall back to a hidden domain template and reject invented constraints',async()=>{
  let calls=0;
  await assert.rejects(()=>planDecision('我想比较一些选择',{model:async()=>{calls++;return {nonsense:true};}}),/暂时没能/);
  assert.equal(calls,2);
  const result=await planDecision('我想比较一些选择',{model:async()=>({schema:{fields:[{key:'cost',label:'费用',unit:'元',direction:-1}]},constraints:[{field:'cost',value:9000,quote:'预算9000'}]})});
  assert.equal(result.settings.limits.cost,null);
});
test('legacy adapter retains original laptop eligibility, scores and winner at every saved budget',()=>{
  for(const budget of [4000,5000,6500,7000,8000,10000]){
    const old=demoSpace();old.settings.budget=budget;
    const adapted=adaptLegacyDecision(old),before=evaluate(old.candidates,old.settings),after=evaluateDecision(adapted.candidates,adapted.settings,adapted.schema);
    assert.deepEqual(after.map(x=>[x.id,x.status]),before.map(x=>[x.id,x.status]));
    for(const row of after.filter(x=>x.status==='eligible'))assert.ok(Math.abs(row.score-before.find(x=>x.id===row.id).score)<1e-9);
  }
});
test('agent-proposed hypothetical branches are validated, displayed together and never replace original conditions',async()=>{
  const io={search:async()=>[],model:async()=>({schema:{label:'几种取舍',fields:[{key:'fee',label:'费用',unit:'元',direction:-1,aliases:['预算']}]},queries:['具体方案'],whatifs:[{name:'如果预算更低？',changes:[{field:'fee',value:300}]},{name:'如果预算放宽？',changes:[{field:'fee',value:800}]},{name:'无效维度',changes:[{field:'invented',value:100}]}]})};
  const result=await runGeneralResearch('帮我比较具体选择，预算500元',io);
  assert.equal(result.scenarios.length,3);assert.equal(result.scenarios[0].id,'scenario-baseline');assert.equal(result.baselineSettings.limits.fee,500);
  assert.deepEqual(result.canvasScenarioIds,result.scenarios.map(s=>s.id));
  assert.deepEqual(result.scenarios.slice(1).map(s=>s.settings.limits.fee),[300,800]);
  assert.ok(result.scenarios.slice(1).every(s=>s.suggestedBy==='agent'));
});
test('planner repair receives concrete validation feedback for missing keys and wrong numeric directions',async()=>{
  let calls=0;const prompts=[];
  const plan=await planDecision('费用最多500元',{model:async messages=>{prompts.push(messages[0].content);return ++calls===1?{schema:{fields:[{key:'total_cost',label:'费用',unit:'元',direction:-1}]},constraints:[{field:'missing_key',value:500,quote:'费用最多500元'}]}:{schema:{fields:[{key:'total_cost',label:'费用',unit:'元',direction:-1}]},constraints:[{field:'total_cost',value:500,quote:'费用最多500元'}],whatifs:[{name:'放宽预算',changes:[{field:'total_cost',value:600}]}]};}});
  assert.equal(calls,2);assert.ok(prompts[1].includes('missing_key'));assert.ok(prompts[1].includes('total_cost'));assert.equal(plan.settings.limits.total_cost,500);
  calls=0;await assert.rejects(()=>planDecision('重量不超过2kg',{model:async()=>{calls++;return {schema:{fields:[{key:'weight',label:'重量',unit:'kg',direction:1}]},constraints:[{field:'weight',value:2,quote:'重量不超过2kg'}]};}}),/暂时没能/);assert.equal(calls,2);
});
test('typed numeric constraints convert compatible units rather than silently treating kilograms as grams',async()=>{
  const plan=await planDecision('重量不超过2kg',{model:async()=>({schema:{fields:[{key:'weight_g',label:'重量',unit:'g',direction:-1}]},constraints:[{field:'weight_g',value:2000,quote:'重量不超过2kg'}]})});
  assert.equal(plan.settings.limits.weight_g,2000);
});
test('unrequested defaults do not block comparison when the user supplied explicit priorities',async()=>{
  const result=await planDecision('预算7000元，内存至少16GB',{model:async()=>({schema:{fields:[{key:'cpu',label:'处理器型号',type:'enum',options:['A','B']},{key:'cost',label:'售价',unit:'元',direction:-1},{key:'ram',label:'内存',unit:'GB',direction:1}],layout:{primaryField:'cpu'}},constraints:[{field:'cost',value:7000,quote:'预算7000元'},{field:'ram',value:16,quote:'内存至少16GB'}],whatifs:[{name:'减少预算',changes:[{field:'cost',value:6000}]}]})});
  assert.deepEqual(result.schema.fields.map(f=>f.key),['cost','ram']);assert.equal(result.schema.layout.primaryField,'cost');
});
