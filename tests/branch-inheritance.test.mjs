import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDecisionSchema,decisionScenarios,changeScenarioSettings,validateDecisionScenarios} from '../src/decision-schema.mjs';
import {importSpace} from '../src/space-import.mjs';

const schema=validateDecisionSchema({fields:[{key:'price',label:'价格',unit:'元',direction:-1},{key:'memory',label:'内存',unit:'GB',direction:1},{key:'weight',label:'重量',unit:'kg',direction:-1}]});
function fixture(){
 const settings={limits:{price:7000,memory:16,weight:2},weights:{price:1,memory:1,weight:1}};
 const branch=(id,parent,changes)=>({id,parentScenarioId:parent,name:id,settings:{...structuredClone(settings),limits:{...settings.limits,price:8000,...changes}},candidateIds:['one']});
 return {schema,settings,baselineSettings:structuredClone(settings),candidates:[{id:'one',name:'软件测试记录',facts:{}}],sources:[],mode:'demo',title:'测试条件继承',question:'软件测试条件继承',scenarios:[branch('expanded','scenario-baseline',{}),branch('budget','expanded',{price:5000}),branch('light','budget',{price:5000,weight:1.7}),branch('memory','expanded',{memory:24}),branch('recovery','memory',{memory:24,weight:1.5}),branch('independent','scenario-baseline',{price:6000})]};
}
test('ancestor edits propagate through inherited dimensions but preserve explicit overrides, unrelated branches and pools',()=>{
 const space=fixture(),tree=decisionScenarios(space),saved=structuredClone(tree),settings=structuredClone(tree.find(s=>s.id==='expanded').settings);settings.limits.memory=32;
 const changed=changeScenarioSettings(tree,'expanded',settings,schema),get=id=>changed.scenarios.find(s=>s.id===id);
 assert.equal(get('budget').settings.limits.memory,32);assert.equal(get('light').settings.limits.memory,32);
 assert.equal(get('budget').settings.limits.price,5000);assert.equal(get('light').settings.limits.weight,1.7);
 assert.equal(get('memory').settings.limits.memory,24);assert.equal(get('recovery').settings.limits.memory,24);
 assert.deepEqual(get('independent'),tree.find(s=>s.id==='independent'));assert.deepEqual(get('scenario-baseline'),tree[0]);
 assert.deepEqual(get('budget').candidateIds,['one']);assert.deepEqual(tree,saved);
});
test('a child override survives its parent temporarily taking the same value, then a save/import and another parent edit',()=>{
 const space=fixture();let tree=decisionScenarios(space);const set=value=>{const settings=structuredClone(tree.find(s=>s.id==='expanded').settings);settings.limits.memory=value;tree=changeScenarioSettings(tree,'expanded',settings,schema).scenarios;};
 set(24);assert.ok(tree.find(s=>s.id==='memory').overrides.limits.includes('memory'));
 const saved={...space,scenarios:tree};tree=decisionScenarios(importSpace(saved));set(32);
 assert.equal(tree.find(s=>s.id==='memory').settings.limits.memory,24);
 assert.equal(tree.find(s=>s.id==='budget').settings.limits.memory,32);
});
test('HTTP validation also propagates an older client parent-only edit rather than treating stale descendants as overrides',()=>{
 const space=fixture(),raw=structuredClone(space.scenarios);raw.find(s=>s.id==='expanded').settings.limits.memory=32;
 const tree=validateDecisionScenarios(space,raw);
 assert.equal(tree.find(s=>s.id==='budget').settings.limits.memory,32);
 assert.equal(tree.find(s=>s.id==='light').settings.limits.memory,32);
 assert.equal(tree.find(s=>s.id==='memory').settings.limits.memory,24);
});
test('undo reapplies inheritance without overwriting subsequent explicit descendant edits',()=>{
 let tree=decisionScenarios(fixture());const parent=tree.find(s=>s.id==='expanded'),before=structuredClone(parent);
 const next=structuredClone(parent.settings);next.limits.memory=32;tree=changeScenarioSettings(tree,parent.id,next,schema).scenarios;
 const child=tree.find(s=>s.id==='budget'),childNext=structuredClone(child.settings);childNext.limits.memory=48;tree=changeScenarioSettings(tree,child.id,childNext,schema).scenarios;
 tree=changeScenarioSettings(tree,parent.id,before.settings,schema,{overrides:before.overrides}).scenarios;
 assert.equal(tree.find(s=>s.id==='expanded').settings.limits.memory,16);assert.equal(tree.find(s=>s.id==='budget').settings.limits.memory,48);assert.equal(tree.find(s=>s.id==='light').settings.limits.memory,48);
});
test('numeric bounds, enum/boolean criteria, weights and evidence mode follow the same inheritance rules',()=>{
 const typed=validateDecisionSchema({fields:[{key:'pets',label:'养宠',type:'boolean'},{key:'light',label:'采光',type:'enum',options:['充足','一般']}]}),settings={limits:{pets:null,light:null},weights:{pets:1,light:1}};
 const tree=[{id:'scenario-baseline',settings},{id:'parent',settings:structuredClone(settings)},{id:'child',parentScenarioId:'parent',settings:structuredClone(settings)}];
 const next={limits:{pets:true,light:'充足'},weights:{pets:0,light:2},evidenceMode:'reviewed'};
 const result=changeScenarioSettings(tree,'parent',next,typed).scenarios;
 assert.deepEqual(result.find(s=>s.id==='child').settings,next);
 assert.throws(()=>changeScenarioSettings(tree,'scenario-baseline',next,typed),/固定/);
 const bad=structuredClone(tree);bad[2].overrides={limits:['missing']};assert.throws(()=>changeScenarioSettings(bad,'parent',next,typed),/无效维度/);
});
