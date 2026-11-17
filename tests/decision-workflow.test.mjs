import test from 'node:test';
import assert from 'node:assert/strict';
import {housingDemo} from '../src/general-space.mjs';
import {editSpace,diffSpaces} from '../src/space-edits.mjs';
import {evidenceRows,reassessDecision} from '../src/decision-workflow.mjs';
import {refreshGeneralEvidence} from '../src/general-refresh.mjs';
function live(){const d=housingDemo();d.mode='live';for(const c of d.candidates)for(const f of Object.values(c.facts))f.status='cited';return d;}
test('typed evidence review validates saved quotes, retains conflict observations, and can be withdrawn',()=>{
 const d=live(),c=d.candidates[0],old=structuredClone(d),f=c.facts.price;
 const confirmed=editSpace(d,{reviews:[{action:'confirm',candidateId:c.id,key:'price',value:f.value,sourceId:f.sourceId,quote:f.quote}]});
 assert.equal(confirmed.candidates[0].facts.price.status,'confirmed');assert.deepEqual(d,old);
 assert.equal(evidenceRows(confirmed,confirmed.candidates[0])[0].status,'confirmed');
 const withdrawn=editSpace(confirmed,{reviews:[{action:'withdraw',candidateId:c.id,key:'price'}]});assert.deepEqual(withdrawn.candidates[0].facts.price,f);
 assert.throws(()=>editSpace(d,{reviews:[{action:'confirm',candidateId:c.id,key:'price',value:1,sourceId:f.sourceId,quote:f.quote}]}),/只能确认/);
 assert.throws(()=>editSpace(housingDemo(),{reviews:[{action:'confirm'}]}),/演示/);
 const conflict=live(),a=conflict.candidates[0],quote='月租 3600 元/月';conflict.sources.push({id:'second',text:quote,title:'同一房源另一份资料',url:'https://example.org/same'});
 a.facts.price={value:null,status:'unknown',sourceId:null,quote:'',conflictingEvidence:[f,{value:3600,sourceId:'second',quote}]};
 assert.equal(evidenceRows(conflict,a)[0].status,'conflict');
 const selected=editSpace(conflict,{reviews:[{action:'confirm',candidateId:a.id,key:'price',value:3600,sourceId:'second',quote}]});
 assert.equal(selected.candidates[0].facts.price.value,3600);assert.equal(evidenceRows(selected,selected.candidates[0])[0].conflict,true);
});
test('a decision captures server-owned context and reassesses subsequent changes under the original conditions',()=>{
 const d=live(),saved=editSpace(d,{decision:{candidateId:'housing-1',rationale:'少花通勤时间',recordedAt:'forged',context:{settings:{limits:{price:1}}}}});
 assert.equal(saved.decision.context.settings.limits.price,4000);assert.notEqual(saved.decision.recordedAt,'forged');assert.equal(saved.decision.context.assessment,'eligible');
 assert.equal(reassessDecision(saved).needsReview,false);
 const changed=structuredClone(saved);changed.candidates[1].facts.price.value=5000;
 const recheck=reassessDecision(changed);assert.equal(recheck.needsReview,true);assert.equal(recheck.assessment,'excluded');assert.ok(recheck.changes.some(c=>c.type==='fact'));
 const diff=diffSpaces(saved,changed);assert.equal(diff.factChanges[0].field,'price');assert.equal(saved.candidates[1].facts.price.value,3900);
});
test('citation recheck reads existing pages without search; failures withdraw evidence and retain history',async()=>{
 const d=live();for(const s of d.sources)s.url='https://example.org/'+s.id;
 const old=structuredClone(d);let searches=0;
 const result=await refreshGeneralEvidence(d,{search:async()=>{searches++;},fetchSource:async url=>{if(url.endsWith('0'))return '这个页面现在不再包含历史参数';if(url.endsWith('1'))throw new Error('blocked');return d.sources.find(s=>s.url===url).text;}});
 assert.equal(searches,0);assert.equal(result.candidates[0].facts.price.status,'unknown');assert.equal(result.candidates[1].facts.price.status,'unknown');assert.equal(result.candidates[2].facts.price.status,'cited');
 assert.equal(result.sources[1].text,d.sources[1].text);assert.equal(result.sources[1].refreshStatus,'failed');assert.deepEqual(d,old);assert.equal(result.refreshReport.checked,4);assert.equal(result.refreshReport.withdrawn,6);
 assert.ok(diffSpaces(d,result).sourceChanges.length>=2);
});

test('an unchanged citation recheck does not invent a changed personal decision',async()=>{
 const d=live();for(const s of d.sources){s.url='https://example.org/'+s.id;s.retrievedAt='2020-01-01T00:00:00.000Z';}
 const saved=editSpace(d,{decision:{candidateId:'housing-1',rationale:'在预算内且通勤较短'}});
 const result=await refreshGeneralEvidence(saved,{fetchSource:async url=>saved.sources.find(s=>s.url===url).text});
 assert.equal(reassessDecision(result).needsReview,false);assert.equal(reassessDecision(result).sourceUpdates.length,1);
 assert.equal(result.decision.context.sources[0].retrievedAt,'2020-01-01T00:00:00.000Z');
});

test('citation recheck resumes its fixed batch without rereading completed pages',async()=>{
 const d=live();for(const s of d.sources)s.url='https://example.org/'+s.id;
 const calls=[],io={fetchSource:async url=>{calls.push(url);return d.sources.find(s=>s.url===url).text;}};let checkpoint;
 await assert.rejects(refreshGeneralEvidence(d,io,()=>{},{onCheckpoint:state=>{checkpoint=structuredClone(state);throw new Error('simulated shutdown');}}),/shutdown/);
 const result=await refreshGeneralEvidence(d,io,()=>{},{snapshot:checkpoint});
 assert.equal(calls.length,4);assert.equal(new Set(calls).size,4);assert.equal(result.refreshReport.checked,4);
});

test('decision replay keeps its recorded normalization rules when the current model changes',()=>{
 const saved=editSpace(live(),{decision:{candidateId:'housing-1',rationale:'保留当时的比较规则'}});
 const next=structuredClone(saved);for(const field of next.schema.fields)field.range={min:0,max:1};
 assert.equal(reassessDecision(next).needsReview,false);assert.equal(saved.decision.context.normalization.price.min,3200);
});
