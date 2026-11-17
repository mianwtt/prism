import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.mjs';

test('adaptive HTTP research and a new qualitative concern execute the graph and persist server-generated schemas',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'prism-adaptive-'));
  let adding=false;
  const cost={key:'fee',label:'费用',type:'number',unit:'元',direction:-1,aliases:['预算'],step:100};
  const quiet={key:'quiet',label:'安静',type:'boolean',preferred:true};
  const io={search:async()=>[{url:'https://example.org/offer/a',title:'方案甲',content:'方案甲 费用300元。明确说明环境安静。'}],model:async messages=>{
    if(messages[0].content.startsWith('Analyze this')){
      const input=JSON.parse(messages[1].content);adding=!!input.change;
      return {schema:{label:adding?'费用与安静的取舍':'比较费用',optionLabel:'选择',fields:adding?[cost,quiet]:[cost],layout:{primaryField:adding?'quiet':'fee',summaryFields:adding?['fee']:[]}},constraints:adding?[{field:'quiet',value:true,quote:'需要安静'}]:[],queries:['具体选择 费用 安静']};
    }
    if(messages[0].content.startsWith('Analyze ONLY'))return {summary:'可以先比较已取得依据的选择。',insights:[]};
    const source=JSON.parse(messages[1].content).sources[0];
    return {candidates:[{name:'方案甲',sourceId:source.id,facts:{fee:{value:300,quote:'费用300元',sourceId:source.id},...(adding?{quiet:{value:true,quote:'明确说明环境安静',sourceId:source.id}}:{})}}]};
  }};
  const app=createApp({directory:dir,env:{},io});await new Promise(r=>app.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.address().port;
  const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;};
  const wait=async job=>{for(let i=0;i<100;i++){const result=await(await fetch(base+'/api/jobs/'+job.id)).json();if(result.status==='complete')return (await fetch(base+'/api/spaces/'+result.spaceId)).json();if(result.status==='failed')throw new Error(result.error);await new Promise(r=>setTimeout(r,15));}throw new Error('Job timeout');};
  try{
    const before=await wait(await post('/api/research',{question:'帮我比较具体的选择，预算500元',adaptive:true}));
    assert.deepEqual(before.schema.fields.map(f=>f.key),['fee']);assert.equal(before.candidates[0].facts.fee.value,300);
    const after=await wait(await post('/api/spaces/'+before.id+'/adapt',{change:'还需要安静',scenarios:before.scenarios,scenarioId:'scenario-baseline'}));
    assert.equal(after.schema.layout.primaryField,'quiet');assert.equal(after.candidates.at(-1).facts.quiet.value,true);assert.equal(after.baselineSettings.limits.quiet,null);
    assert.equal(after.scenarios.at(-1).settings.limits.quiet,true);assert.equal(after.parentId,before.id);
    const original=await(await fetch(base+'/api/spaces/'+before.id)).json();assert.equal(original.schema.fields.length,1);assert.equal(original.candidates[0].facts.quiet,undefined);
  }finally{await app.shutdown();await rm(dir,{recursive:true,force:true});}
});
