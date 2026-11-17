import test from 'node:test';
import assert from 'node:assert/strict';
import {gatherCandidateSources} from '../src/candidate-retrieval.mjs';
test('each incomplete candidate gets specification and merchant searches, preserving engine provenance',async()=>{
 const candidates=['HP 星Book 16','华硕无畏16','ThinkBook 14','Excluded 4'].map(name=>({name,facts:{}}));
 const calls=[];
 const output=await gatherCandidateSources(candidates,[],{searchCandidateSources:async query=>{calls.push(query);return[{title:query,url:'https://item.jd.com/'+calls.length+'.html',engine:'Bing',raw_content:'CPU Core 5, 内存16GB，重量1.64kg。'.repeat(25)}]}});
 assert.equal(calls.length,13);assert.equal(output.searches,13);
 assert.ok(calls[0].includes('HP 星Book 16'));assert.ok(calls.some(q=>q.includes('site:suning.com')));
 assert.ok(calls.some(q=>q.includes('site:detail.tmall.com')));assert.ok(calls.some(q=>q.includes('site:item.taobao.com')));
 assert.ok(calls.every(q=>!q.includes('Excluded')));assert.equal(output.sources[0].retrieval.engine,'Bing');
});
test('brand shopping searches still execute the specification fallback when all stores return no readable pages',async()=>{
 const calls=[];
 const output=await gatherCandidateSources([{name:'HUAWEI MateBook14',facts:{}}],[],{searchCandidateSources:async query=>{calls.push(query);return[];}});
 assert.equal(output.searches,6);assert.match(calls[0],/vmall.com/);assert.match(calls.at(-1),/参数 内存 重量 规格/);
});
test('candidate search failure and duplicate pages preserve prior evidence',async()=>{
 const sources=[{id:'s1',title:'HP 星Book16',url:'https://example.com/a',text:'Existing exact quote',kind:'page'}];
 let n=0;
 const result=await gatherCandidateSources([{name:'HP 星Book16',facts:{}}],sources,{searchCandidateSources:async()=>{if(++n===1)throw Error('offline');return[{url:sources[0].url,content:'short snippet'}]}});
 assert.equal(result.sources.length,1);assert.equal(result.sources[0].text,sources[0].text);assert.equal(result.warnings.length,1);
 assert.deepEqual(sources,[{id:'s1',title:'HP 星Book16',url:'https://example.com/a',text:'Existing exact quote',kind:'page'}]);
});
