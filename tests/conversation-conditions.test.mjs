import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDecisionChange,validateDecisionSchema} from '../src/decision-schema.mjs';
import {converse} from '../src/conversation.mjs';
import {adaptLegacyDecision} from '../src/legacy-decision.mjs';
import {completeFixture} from './browser/complete-space.fixture.mjs';

const schema=validateDecisionSchema({fields:[
 {key:'cost',label:'公开标价 (元)',conditionLabel:'预算',unit:'元',direction:-1,aliases:['价格'],step:1000},
 {key:'ram',label:'内存 (GB)',unit:'GB',direction:1,step:8},
 {key:'mass',label:'重量',unit:'kg',direction:-1,step:.1},
]});
const settings={limits:{cost:7000,ram:16,mass:2},weights:{cost:1,ram:1,mass:1}};
for(const message of ['如果降低预算到5000以内呢','如果预算降低到5000以内呢','把预算减少到5000元','预算降至5,000元','将预算控制在5000以内'])test('absolute target is not a delta: '+message,()=>{
 const result=parseDecisionChange(message,settings,schema);
 assert.equal(result.settings.limits.cost,5000);assert.deepEqual(result.changed,['cost']);assert.deepEqual(result.specified,['cost']);assert.equal(settings.limits.cost,7000);
});
for(const [message,key,value]of [['降低预算1000元','cost',6000],['预算减少1000元','cost',6000],['内存提高到32GB','ram',32],['内存增加16GB','ram',32],['重量降到1500克','mass',1.5],['重量减少200克','mass',1.8]])test('word order, target markers and units: '+message,()=>{
 assert.equal(parseDecisionChange(message,settings,schema).settings.limits[key],value);
});
test('negative or ambiguous requests do not silently alter a condition',()=>{
 for(const message of ['不要降低预算到5000元','预算5000至6000元','预算减少1000以内'])assert.deepEqual(parseDecisionChange(message,settings,schema).changed,[],message);
});
test('the screenshot request forks a legacy laptop decision, then recognizes the already applied target without model calls',async()=>{
 const original=adaptLegacyDecision(completeFixture()),snapshot=structuredClone(original);
 const io={model:async()=>assert.fail('Explicit numeric changes must not depend on model output')};
 const next=await converse(original,{message:'如果降低预算到5000以内呢',scenarioId:'scenario-baseline'},io);
 assert.equal(next.scenarios.length,original.scenarios.length+1);assert.equal(next.settings.limits.price,5000);
 assert.equal(next.scenarios[0].settings.limits.price,7000);assert.match(next.conversation.at(-1).content,/7,000元 → 5,000元/);assert.match(next.conversation.at(-1).content,/2 个 → 1 个可选/);
 const same=await converse(next,{message:'如果降低预算到5000以内呢',scenarioId:next.activeScenarioId},io);
 assert.equal(same.scenarios.length,next.scenarios.length);assert.equal(same.activeScenarioId,next.activeScenarioId);
 assert.match(same.conversation.at(-1).content,/已经.*预算.*5,000/);assert.doesNotMatch(same.conversation.at(-1).content,/没有形成可执行/);assert.deepEqual(original,snapshot);
});

for(const message of ['预算在6000-7000呢','如果预算改为6000元到7000元呢','预算6000–7000元，内存提高到32GB'])test('an unsupported range cannot become a claimed adjustment or a partial update: '+message,async()=>{
 const space=adaptLegacyDecision(completeFixture()),selected=space.scenarios.find(s=>s.id==='scenario-budget');
 const result=await converse(space,{message,scenarioId:selected.id},{model:async()=>assert.fail('Unsupported ranges must receive an application-grounded clarification')});
 assert.equal(result.settings.limits.price,5000);assert.equal(result.scenarios.length,space.scenarios.length);
 assert.deepEqual(result.settings,selected.settings);assert.match(result.conversation.at(-1).content,/没有应用区间/);assert.match(result.conversation.at(-1).content,/5,000元/);
 assert.deepEqual(result.conversation.at(-1).changedFields,[]);assert.equal(result.conversation.at(-1).scenarioId,selected.id);
});
