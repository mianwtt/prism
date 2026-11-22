import test from 'node:test';
import assert from 'node:assert/strict';
import {converse} from '../src/conversation.mjs';
import {housingDemo} from '../src/general-space.mjs';
import {adaptLegacyDecision} from '../src/legacy-decision.mjs';
import {completeFixture} from './browser/complete-space.fixture.mjs';
import {importSpace} from '../src/space-import.mjs';

const noModel={model:async()=>assert.fail('A resolved interaction must execute without model prose')};
const turn=(space,message,extra={})=>converse(space,{message,scenarioId:space.activeScenarioId||'scenario-baseline',...extra},noModel);
const laptop=()=>adaptLegacyDecision(completeFixture());

test('a categorical short reply restores the exact schema value after clearing, with no model-only confirmation',async()=>{
 const space=laptop();space.schema.fields.push({key:'os',label:'操作系统',type:'enum',options:['Windows','Linux'],direction:1,aliases:[]});
 for(const settings of [space.settings,space.baselineSettings,...space.scenarios.map(s=>s.settings)]){settings.limits.os='Windows';settings.weights.os=0;}
 const cleared=await turn(space,'操作系统不限制了'),restored=await turn(cleared,'还是Windows吧');
 assert.equal(cleared.settings.limits.os,null);assert.equal(restored.settings.limits.os,'Windows');assert.match(restored.conversation.at(-1).content,/不限 → Windows/);
 assert.equal(restored.baselineSettings.limits.os,'Windows');assert.deepEqual(restored.candidates,space.candidates);
 const explained=await converse(restored,{message:'为什么选择Linux？',scenarioId:restored.activeScenarioId},{model:async()=>({intent:'explain',reply:'这是说明，不修改当前筛选。',operations:[{type:'set',field:'os',value:'Linux',quote:'Linux'}]})});assert.equal(explained.settings.limits.os,'Windows');
});

test('budget → contextual clear → undo twice, with deterministic counts and intact photos and baseline',async()=>{
 const original=laptop(),snapshot=structuredClone(original);
 const budget=await turn(original,'如果降低预算到5000以内呢');
 const cleared=await turn(budget,'如果没有要求呢');
 assert.equal(cleared.settings.limits.price,null);assert.equal(cleared.settings.limits.memory,16);
 assert.match(cleared.conversation.at(-1).content,/5,000元 → 不限/);assert.match(cleared.conversation.at(-1).content,/1 个 → 2 个可选/);
 const restored=await turn(cleared,'还是刚才那样');
 assert.equal(restored.activeScenarioId,budget.activeScenarioId);assert.equal(restored.settings.limits.price,5000);
 assert.equal(restored.scenarios.length,cleared.scenarios.length);assert.ok(!restored.canvasScenarioIds.includes(cleared.activeScenarioId));
 assert.ok(restored.conversation.find(m=>m.action?.id===cleared.conversation.at(-1).action.id).action.undoneBy);
 const baseline=await turn(restored,'撤销');assert.equal(baseline.activeScenarioId,'scenario-baseline');assert.equal(baseline.settings.limits.price,7000);
 assert.deepEqual(original,snapshot);assert.deepEqual(restored.candidates,original.candidates);assert.deepEqual(restored.sources,original.sources);
});

test('ambiguous clearing persists one specific question; ordinal and button answers do the same thing after export/import',async()=>{
 const space=housingDemo(),asked=await turn(space,'如果没有要求呢');
 assert.deepEqual(asked.settings,space.settings);assert.equal(asked.scenarios.length,1);
 const pending=asked.conversationState.pending;assert.match(pending.question,/取消哪部分/);assert.equal(pending.options[0].label,'只取消月租限制');
 const imported=importSpace(asked),selected=await turn(imported,'第一个');
 assert.equal(selected.settings.limits.price,null);assert.equal(selected.settings.limits.area,30);assert.equal(selected.settings.limits.commute,45);
 assert.equal(selected.conversationState.pending,undefined);assert.equal(selected.conversation.at(-1).interaction.answeredId,pending.id);
 const clicked=await turn(asked,pending.options[0].label,{choiceId:pending.options[0].id,clarificationId:pending.id});
 assert.deepEqual(clicked.settings,selected.settings);
 await assert.rejects(()=>turn(clicked,'第一个',{choiceId:pending.options[0].id,clarificationId:pending.id}),/失效/);
});

test('clear all removes hard limits while keeping evidence, weights and baseline',async()=>{
 const space=housingDemo(),next=await turn(space,'取消全部筛选条件');
 assert.ok(Object.values(next.settings.limits).every(value=>value===null));assert.deepEqual(next.settings.weights,space.settings.weights);
 assert.deepEqual(next.baselineSettings,space.baselineSettings);assert.equal(next.scenarios.length,2);
});

test('UI focus resolves bare numbers and short cancellation; changing paths does not reuse a stale focus',async()=>{
 const space=laptop(),memory=space.schema.fields.find(field=>/内存/.test(field.label)).key;
 const changed=await turn(space,'32G呢',{focusField:memory});assert.equal(changed.settings.limits[memory],32);
 const cleared=await turn(changed,'不限制了');assert.equal(cleared.settings.limits[memory],null);assert.equal(cleared.settings.limits.price,7000);
 const switched=await turn(cleared,'如果没有要求呢',{scenarioId:'scenario-baseline'});
 assert.ok(switched.conversationState.pending);assert.equal(switched.settings.limits[memory],16);
});

test('bare numbers without a focus ask for the field, and the answer executes the saved value',async()=>{
 const asked=await turn(housingDemo(),'5000呢');assert.ok(asked.conversationState.pending);
 const answered=await turn(asked,'第一个');assert.equal(answered.settings.limits.price,5000);assert.equal(answered.settings.limits.area,30);
});

test('multi-field context is not silently treated as permission to clear every field',async()=>{
 const changed=await turn(housingDemo(),'月租5000元，面积至少50平米');
 const asked=await turn(changed,'那如果没有要求呢');assert.ok(asked.conversationState.pending);assert.equal(asked.settings.limits.price,5000);assert.equal(asked.settings.limits.area,50);
});

test('cancel buttons cannot answer a pending question belonging to a different branch',async()=>{
 const space=laptop(),asked=await turn(space,'如果没有要求呢'),pending=asked.conversationState.pending;
 await assert.rejects(()=>turn(asked,'只取消预算限制',{scenarioId:'scenario-budget',choiceId:pending.options[0].id,clarificationId:pending.id}),/失效/);
});

test('undo refuses later manual edits, stale action IDs, and never deletes retained branches',async()=>{
 const changed=await turn(housingDemo(),'月租5000'),id=changed.conversation.at(-1).action.id;
 const scenarios=structuredClone(changed.scenarios);scenarios.at(-1).settings.limits.price=6000;
 const next=await turn(changed,'撤销',{scenarios,undoActionId:id});assert.equal(next.settings.limits.price,6000);assert.match(next.conversation.at(-1).content,/后来又调整/);
 await assert.rejects(()=>turn(changed,'撤销',{scenarioId:'scenario-baseline',undoActionId:id}),/不属于当前路径/);
});

test('a model-specific clarification survives and receives explicit UI context; fabricated actions are rejected',async()=>{
 const space={...housingDemo(),mode:'live'};
 const answer=await converse(space,{message:'我想住得舒服一些',focusField:'area'},{model:async messages=>{
   assert.deepEqual(JSON.parse(messages[1].content).context.focusFields,['area']);
   return {intent:'clarify',reply:'你更在意面积，还是独立空间？',operations:[]};
 }});
 assert.equal(answer.conversation.at(-1).content,'你更在意面积，还是独立空间？');assert.equal(answer.scenarios.length,1);
 const fabricated=await converse(space,{message:'改得舒服一些'},{model:async()=>({reply:'预算已改到9000',operations:[{type:'set',field:'price',value:9000,quote:'舒服'}]})});
 assert.equal(fabricated.settings.limits.price,4000);assert.doesNotMatch(fabricated.conversation.at(-1).content,/预算已改/);
});

test('explanations containing numbers never apply conditions; explicit null remains allowed only as a clear operation',async()=>{
 const space={...housingDemo(),mode:'live'};
 const next=await converse(space,{message:'为什么预算5000更好'},{model:async()=>({reply:'可以比较预算变化后的取舍。',operations:[{type:'set',field:'price',value:5000,quote:'预算5000'}]})});
 assert.equal(next.settings.limits.price,4000);assert.equal(next.scenarios.length,1);
 const cleared=await turn(space,'预算没有要求');assert.equal(cleared.settings.limits.price,null);
});

test('imports preserve executed actions for undo but reject malicious pending operations',async()=>{
 const changed=await turn(housingDemo(),'月租5000'),imported=importSpace(changed),undone=await turn(imported,'撤销');assert.equal(undone.settings.limits.price,4000);
 const asked=await turn(housingDemo(),'如果没有要求呢');asked.conversationState.pending.options[0].operations[0].field='unknown';
 assert.throws(()=>importSpace(asked),/不存在的条件/);
});

test('cancelling a pending question or negating cancellation does not remove a limit',async()=>{
 const asked=await turn(housingDemo(),'如果没有要求呢'),dismissed=await turn(asked,'不取消了');
 assert.equal(dismissed.conversationState.pending,undefined);assert.deepEqual(dismissed.settings,asked.settings);
 const next=await turn(housingDemo(),'不取消月租限制');assert.equal(next.settings.limits.price,4000);
});

test('a removal only targets its clause and never clears explicitly retained requirements',async()=>{
 const next=await turn(housingDemo(),'取消面积要求但保留月租和通勤');
 assert.equal(next.settings.limits.area,null);assert.equal(next.settings.limits.price,4000);assert.equal(next.settings.limits.commute,45);
 const mixed=await turn(housingDemo(),'月租不限，面积至少50平米');assert.equal(mixed.settings.limits.price,null);assert.equal(mixed.settings.limits.area,50);
});

test('semantic model actions use the same typed executor without requiring a fixed cancellation keyword',async()=>{
 const space={...housingDemo(),mode:'live'};
 const result=await converse(space,{message:'月租无所谓'},{model:async()=>({intent:'change',reply:'可以取消租金要求。',operations:[{type:'clear',field:'price',quote:'月租无所谓'}]})});
 assert.equal(result.settings.limits.price,null);assert.equal(result.settings.limits.area,30);assert.equal(result.conversation.at(-1).action.type,'change');
});

test('a model clarification is saved with effect-derived options and a later ordinal executes exactly that proposal',async()=>{
 const space={...housingDemo(),mode:'live'};
 const asked=await converse(space,{message:'费用这块我都可以接受'},{model:async()=>({intent:'clarify',reply:'你想取消月租限制吗？',clarification:{question:'你想取消哪部分筛选？',options:[{label:'随便展示',operations:[{type:'clear',field:'price'}]},{label:'乱填',operations:[{type:'set',field:'price',value:99999,quote:'可以接受'}]}]}})});
 assert.equal(asked.conversationState.pending.options.length,1);assert.equal(asked.conversationState.pending.options[0].label,'取消月租限制');
 const next=await turn(asked,'第一个');assert.equal(next.settings.limits.price,null);assert.equal(next.settings.limits.commute,45);
});

test('an unrelated model question cannot override a valid targeted operation or remove other requirements',async()=>{
 const space={...housingDemo(),mode:'live'};
 const result=await converse(space,{message:'月租无所谓'},{model:async()=>({intent:'change',reply:'您还要保留其他条件吗？',operations:[{type:'clear',field:'price',quote:'月租无所谓'}],clarification:{question:'要不要取消其他要求？',options:[{operations:[{type:'clear',field:'area'},{type:'clear',field:'commute'}]}]}})});
 assert.equal(result.settings.limits.price,null);assert.equal(result.settings.limits.area,30);assert.equal(result.settings.limits.commute,45);assert.equal(result.conversationState.pending,undefined);
});

test('semantic fresh-evidence requests schedule real research, while unsolicited research never changes an explanatory turn',async()=>{
 const space={...housingDemo(),mode:'live'};
 const result=await converse(space,{message:'我想多了解一下采光情况',autoResearch:true},{model:async()=>({intent:'research',reply:'需要补充这些房源的朝向和采光依据。',operations:[],researchNeeded:true})});
 assert.equal(result.pendingConversationResearch.request,'我想多了解一下采光情况');assert.equal(result.conversation.at(-1).interaction.researchScheduled,true);assert.deepEqual(result.settings,space.settings);
 const explanation=await converse(space,{message:'为什么月租更重要',autoResearch:true},{model:async()=>({intent:'research',reply:'需要更多信息才能解释。',operations:[],researchNeeded:true})});assert.equal(explanation.pendingConversationResearch,undefined);
});

test('human journey: asking whether 5000 is suitable never edits the 7000 baseline or repeats stale history as current state',async()=>{
 const original=laptop(),space={...original,conversation:[{role:'assistant',content:'之前的预算是5000。',scenarioId:'scenario-budget'}]};
 const next=await turn(space,'我只是想了解预算5000合不合适，先不要改条件');
 assert.equal(next.settings.limits.price,7000);assert.match(next.conversation.at(-1).content,/当前条件是：预算 ≤ 7,000元/);assert.match(next.conversation.at(-1).content,/1 个方案符合/);assert.equal(next.scenarios.length,space.scenarios.length);
});

test('human journey: another 500 is a computed increment and cancelling an old numeric threshold removes it',async()=>{
 const budget=await turn(laptop(),'预算改为5000元');
 const more=await turn(budget,'那预算再增加500元呢');assert.equal(more.settings.limits.price,5500);
 const cleared=await turn(more,'取消预算5000元这个限制');assert.equal(cleared.settings.limits.price,null);assert.equal(cleared.settings.limits.memory,16);
});

test('human journey: a correction discards the negated old value and applies the affirmative value in its field context',async()=>{
 const large=await turn(laptop(),'内存改为32GB');const corrected=await turn(large,'不，不是32G，我还是要16G');
 assert.equal(corrected.settings.limits.memory,16);assert.match(corrected.conversation.at(-1).content,/32GB → 16GB/);
});

test('semantic field synonyms can target an existing generated key while the quoted value remains required',async()=>{
 const space={...housingDemo(),mode:'live'};space.schema.fields[0].label='月租金';space.schema.fields[0].conditionLabel='月租金';space.schema.fields[0].aliases=['租金'];
 const next=await converse(space,{message:'如果月租改成3000元呢'},{model:async()=>({intent:'change',reply:'将调整月租。',operations:[{type:'set',field:'price',value:3000,quote:'月租改成3000元'}]})});
 assert.equal(next.settings.limits.price,3000);assert.equal(next.settings.limits.area,30);assert.match(next.conversation.at(-1).content,/4,000元\/月 → 3,000元\/月/);
 assert.ok(next.schema.fields[0].aliases.includes('月租'));const more=await turn(next,'那月租再增加500元呢');assert.equal(more.settings.limits.price,3500);
 const cleared=await turn(more,'月租不限制了，其他要求保留');assert.equal(cleared.settings.limits.price,null);assert.equal(cleared.settings.limits.area,30);
});

test('common supported edits in a model clarification apply once without accepting unrelated proposed removals',async()=>{
 const space={...housingDemo(),mode:'live'};space.schema.fields[0].label=space.schema.fields[0].conditionLabel='月租金';space.schema.fields[0].aliases=['租金'];
 const edit={type:'set',field:'price',value:3000,quote:'月租改成3000元'};
 const result=await converse(space,{message:'如果月租改成3000元呢'},{model:async()=>({intent:'clarify',reply:'其他条件还保留吗？',clarification:{question:'其他条件还保留吗？',options:[{operations:[edit]},{operations:[edit,{type:'clear',field:'area'}]},{operations:[edit,{type:'clear',field:'commute'}]}]}})});
 assert.equal(result.settings.limits.price,3000);assert.equal(result.settings.limits.area,30);assert.equal(result.settings.limits.commute,45);assert.equal(result.conversationState.pending,undefined);
});
