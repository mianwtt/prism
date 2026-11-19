import test from 'node:test';import assert from 'node:assert/strict';
import {repairPlanConstraints,normalizeCatalogRequests} from '../src/plan-constraints.mjs';
import {planDecision,normalizeResearchPlan} from '../src/general-research.mjs';
test('format-only quote repair binds the actual budget and removes an unsolicited platform dimension',async()=>{
 const plan={schema:{fields:[{key:'price',label:'公开标价',unit:'元',direction:-1},{key:'ram',label:'内存',unit:'GB',direction:1},{key:'source',label:'来源平台',type:'enum',options:['suning','jd'],direction:1}]},constraints:[{field:'price',value:5000,quote:'预算不超过 5000 元'},{field:'ram',value:16,quote:'内存至少 16GB'}],queries:['目录'],whatifs:[{name:'其他预算',changes:[{field:'price',value:6000}]}]};
 const result=await planDecision('预算不超过5000元，内存至少16GB，需要来源图片',{model:async()=>plan});
 assert.equal(result.settings.limits.price,5000);assert.deepEqual(result.schema.fields.map(f=>f.key),['price','ram']);assert.equal(result.planRepairs.filter(r=>r.kind==='quote-whitespace').length,2);
 assert.equal(plan.constraints[0].quote,'预算不超过 5000 元');
});
test('only an unambiguous quantity from an actual user quote can correct model conversion',()=>{
 const schema={fields:[{key:'disk',unit:'GB',type:'number'}]},raw={schema,constraints:[{field:'disk',value:1000,quote:'硬盘至少1TB'}]};
 const p=repairPlanConstraints(raw,'预算6500元，硬盘至少1TB');assert.equal(p.constraints[0].value,1024);assert.equal(raw.constraints[0].value,1000);
 assert.equal(repairPlanConstraints(raw,'硬盘至少2TB').constraints[0].value,1000,'a different source value cannot validate the invented quote');
 const ambiguous={schema,constraints:[{field:'disk',value:1000,quote:'内存16GB，硬盘1TB'}]};assert.equal(repairPlanConstraints(ambiguous,'内存16GB，硬盘1TB').constraints[0].value,1000);
});
test('catalog input contracts distinguish a city from product keywords and accept only available platforms',()=>{
 const platforms=[{platform:'goods',input:'keywords'},{platform:'rent',input:'location'}];
 assert.deepEqual(normalizeCatalogRequests([{platform:'rent',city:'上海'},{platform:'goods',keywords:'相机'},{platform:'unknown',keywords:'test'}],platforms),[{platform:'rent',location:'上海'},{platform:'goods',keywords:'相机'}]);
 assert.deepEqual(normalizeCatalogRequests([{platform:'rent',keywords:'上海租房'}],platforms),[]);
});
test('model/configuration strings are identity metadata but an explicitly constrained identity is not discarded',()=>{
 const identity={key:'model',label:'型号/配置',type:'string'},field={key:'price',label:'价格',type:'number',unit:'元'};
 assert.deepEqual(normalizeResearchPlan({schema:{fields:[identity,field]},constraints:[]}).schema.fields,[field]);
 assert.equal(normalizeResearchPlan({schema:{fields:[identity,field]},constraints:[{field:'model',value:'用户指定型号'}]}).schema.fields.length,2);
});

test('reserved object-identity keys are display metadata across domains without enumerating domain-specific labels',()=>{
 const price={key:'price',label:'价格',unit:'元',type:'number'};
 for(const label of ['手机型号','商品型号/名称','另一类对象的标识']){
  const identity={key:'model',label,type:'string'};
  const raw={schema:{fields:[identity,price],layout:{primaryField:'model'}},constraints:[]};
  assert.deepEqual(normalizeResearchPlan(raw).schema.fields,[price]);assert.equal(normalizeResearchPlan(raw).schema.layout.primaryField,undefined);
  assert.equal(normalizeResearchPlan({...raw,constraints:[{field:'model',value:'用户指定对象'}]}).schema.fields.length,2);
 }
});

test('UI-shaped enum options normalize their existing values without inventing categories or losing quoted constraints and source-photo requirements',async()=>{
 const raw={schema:{fields:[{key:'rent',label:'月租金',unit:'元',direction:-1},{key:'kind',label:'租赁方式',type:'enum',options:[{value:'整租',label:'整套出租'},{value:'合租',label:'共享住房'}],preferred:'整租'}]},constraints:[{field:'rent',value:2800,quote:'月租最多2800元'},{field:'kind',value:'整租',quote:'找整租房子'}],queries:['公开目录'],whatifs:[{name:'如果接受合租',changes:[{field:'kind',value:'合租'}]}]};
 let calls=0;const plan=await planDecision('找整租房子，月租最多2800元，有各自原页照片',{model:async()=>{calls++;return raw;}});
 assert.equal(calls,1);assert.deepEqual(plan.schema.fields.find(f=>f.key==='kind').options,['整租','合租']);assert.equal(plan.settings.limits.kind,'整租');assert.equal(plan.evidenceRequirements.sourcePhotos,true);
 const single=structuredClone(raw);single.schema.fields[1].options.pop();assert.deepEqual(normalizeResearchPlan(single).schema.fields[1].options,['整租']);
 assert.deepEqual(raw.schema.fields[1].options[0],{value:'整租',label:'整套出租'});
});
test('no-speculation and no-stock directives never become candidate facts or introduce a photo requirement',()=>{
 const fields=[{key:'rent',label:'月租',type:'number',unit:'元/月'},{key:'instruction',label:'不推测通勤',type:'boolean'},{key:'stock',label:'不考虑库存',type:'boolean'}];
 const plan=normalizeResearchPlan({schema:{fields},constraints:[{field:'instruction',value:true}],whatifs:[]});
 assert.deepEqual(plan.schema.fields.map(f=>f.key),['rent']);assert.deepEqual(plan.constraints,[]);assert.equal(plan.evidenceRequirements,undefined);
 const realPreference={key:'commute',label:'通勤时间',unit:'分钟',type:'number'};
 assert.deepEqual(normalizeResearchPlan({schema:{fields:[realPreference]},constraints:[]}).schema.fields,[realPreference]);
});

test('a repaired plan prunes an unsolicited invalid dimension before validation, keeping the requested thresholds and location query',async()=>{
 const request='在示例城找房，月租不超过2800元，面积至少30平方米';
 const fields=[{key:'rent',label:'月租',unit:'元',direction:-1},{key:'area',label:'面积',unit:'平方米',direction:1},{key:'city',label:'城市',type:'enum',options:['示例城']}];
 const constraints=[{field:'rent',value:2800,quote:'月租不超过2800元'},{field:'area',value:30,quote:'面积至少30平方米'}];let calls=0;
 const plan=await planDecision(request,{model:async()=>({schema:{fields},constraints:++calls===1?[...constraints,{field:'city',value:'示例城',quote:'在示例城找房'}]:constraints,queries:['示例城租房'],whatifs:[{name:'其他预算',changes:[{field:'rent',value:3000}]}]})});
 assert.equal(calls,2);assert.deepEqual(plan.schema.fields.map(f=>f.key),['rent','area']);assert.equal(plan.settings.limits.rent,2800);assert.equal(plan.settings.limits.area,30);assert.deepEqual(plan.queries,['示例城租房']);
});
