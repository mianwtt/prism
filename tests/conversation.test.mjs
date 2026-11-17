import test from 'node:test';
import assert from 'node:assert/strict';
import {converse} from '../src/conversation.mjs';
import {housingDemo} from '../src/general-space.mjs';
import {validateDecisionScenarios} from '../src/decision-schema.mjs';
test('conversation explains without spawning scenarios; explicit change forks and preserves context',async()=>{
 const space={...housingDemo(),mode:'live'},calls=[];
 const io={model:async messages=>{calls.push(messages);return {reply:'这套房超过了月租预算。',changes:[],researchNeeded:false};}};
 const answer=await converse(space,{message:'我更关心日常生活方便，你怎么看？'},io);
 assert.equal(answer.scenarios.length,1);assert.equal(answer.conversation.length,2);
 const fork=await converse(answer,{message:'如果月租改为5000元呢？',scenarioId:'scenario-baseline'}, {model:async messages=>{calls.push(messages);return {reply:'可以试试这个预算。',changes:[{field:'price',value:5000,quote:'月租改为5000元'}],researchNeeded:false};}});
 assert.equal(fork.scenarios.length,2);assert.equal(fork.scenarios[0].settings.limits.price,4000);assert.equal(fork.scenarios[1].settings.limits.price,5000);assert.equal(fork.scenarios[1].parentScenarioId,'scenario-baseline');assert.equal(fork.conversation.length,4);
 assert.equal(calls.length,1); // An explicit typed change executes without relying on LLM prose.
 const follow=await converse(fork,{message:'那我还想看周边环境',scenarioId:fork.activeScenarioId},{model:async messages=>{calls.push(messages);return {reply:'需要补充周边环境的资料。',changes:[],researchNeeded:true};}});
 assert.equal(JSON.parse(calls[1][1].content).history.length,4);
 assert.equal(follow.scenarios.length,2);assert.equal(follow.conversation.at(-1).researchRequest,'那我还想看周边环境');
 assert.deepEqual(space.conversation,undefined);
});
test('unsupported values and quotes cannot silently change constraints; lineage cycles rejected',async()=>{
 const space={...housingDemo(),mode:'live'};
 const next=await converse(space,{message:'为什么没选这套房'}, {model:async()=>({reply:'先看看条件。',changes:[{field:'price',value:7000,quote:'预算7000'}]})});
 assert.equal(next.scenarios.length,1);
 const a={id:'a',name:'a',parentScenarioId:'b',settings:space.settings},b={...a,id:'b',name:'b',parentScenarioId:'a'};
 assert.throws(()=>validateDecisionScenarios(space,[a,b]),/循环/);
});
test('exclusion explanations use the current branch calculation rather than an LLM remembered budget',async()=>{
 const space={...housingDemo(),mode:'live'};
 const next=await converse(space,{message:'为什么有些房源没有通过条件？'},{model:async()=>{throw new Error('This answer must use the deterministic result');}});
 assert.match(next.conversation.at(-1).content,/4,000/);
 assert.match(next.conversation.at(-1).content,/月租超过上限/);
 assert.match(next.conversation.at(-1).content,/通勤超过上限/);
 assert.equal(next.scenarios.length,1);
});
test('relative conditions are validated against the parent, not rejected as an unquoted total',async()=>{
 const next=await converse(housingDemo(),{message:'租金增加1000，面积至少50平米'});
 assert.equal(next.scenarios.length,2);
 assert.equal(next.scenarios[1].settings.limits.price,5000);
 assert.equal(next.scenarios[1].settings.limits.area,50);
});
