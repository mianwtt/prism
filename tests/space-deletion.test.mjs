import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {emptyCheckpoint} from '@langchain/langgraph-checkpoint';
import {SqliteSaver} from '@langchain/langgraph-checkpoint-sqlite';
import {Store} from '../src/store.mjs';
import {Jobs} from '../src/jobs.mjs';
import {createApp} from '../src/server.mjs';
import {housingDemo} from '../src/general-space.mjs';
import {demoSpace} from '../src/demo.mjs';

test('deleting any version removes the entire local decision, related tasks and checkpoints, retaining unrelated data after restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'prism-delete-')),store=new Store(directory),root=await store.save(housingDemo());
 const second=await store.save({...housingDemo(),conversation:[{role:'user',content:'private conversation'}]},root),third=await store.save(housingDemo(),root),other=await store.save(demoSpace());
 const jobs=new Jobs(directory,store,()=>({}));
 const owned={id:randomUUID(),type:'refresh',parentId:root.id,spaceId:second.id,resultId:second.id,status:'complete',createdAt:new Date().toISOString(),events:[{message:'private research'}]};
 const unrelated={...owned,id:randomUUID(),parentId:other.id,spaceId:other.id,resultId:other.id};
 for(const job of [owned,unrelated]){
  jobs.records.set(job.id,job);jobs.persist(job);
  await jobs.saver.put({configurable:{thread_id:job.id,checkpoint_ns:''}},emptyCheckpoint(),{source:'input',step:0,parents:{}},{});
 }
 for(const suffix of ['.refresh.json','.refresh.json.tmp','.json.tmp'])await writeFile(join(directory,'jobs',owned.id+suffix),'private source snapshot');
 await jobs.close();
 let server=createApp({directory,env:{}});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await server.shutdown();await rm(directory,{recursive:true,force:true});});
 const base=()=>`http://127.0.0.1:${server.address().port}`;
 const deleted=await fetch(base()+'/api/spaces/'+second.id,{method:'DELETE'});assert.equal(deleted.status,200);
 const result=await deleted.json();assert.equal(result.deletedRootId,root.id);assert.deepEqual(new Set(result.deletedVersionIds),new Set([root.id,second.id,third.id]));assert.deepEqual(result.deletedJobIds,[owned.id]);
 for(const version of [root,second,third])for(const suffix of ['','/export','/versions'])assert.equal((await fetch(base()+'/api/spaces/'+version.id+suffix)).status,404);
 assert.equal((await fetch(base()+'/api/jobs/'+owned.id)).status,404);
 assert.equal((await fetch(base()+'/api/jobs/'+unrelated.id)).status,200);
 assert.deepEqual((await (await fetch(base()+'/api/spaces')).json()).map(s=>s.id),[other.id]);
 assert.ok((await readdir(join(directory,'jobs'))).every(name=>!name.startsWith(owned.id)));
 const saver=SqliteSaver.fromConnString(join(directory,'agent-checkpoints.sqlite'));
 assert.equal(await saver.getTuple({configurable:{thread_id:owned.id}}),undefined);
 assert.ok(await saver.getTuple({configurable:{thread_id:unrelated.id}}));saver.db.close();
 await assert.rejects(store.save(housingDemo(),root),{code:'ENOENT'});
 await server.shutdown();server=createApp({directory,env:{}});server.listen(0,'127.0.0.1');await once(server,'listening');
 assert.equal((await fetch(base()+'/api/spaces/'+root.id)).status,404);assert.equal((await fetch(base()+'/api/spaces/'+other.id)).status,200);
 assert.equal((await fetch(base()+'/api/jobs/'+owned.id+'/resume',{method:'POST',body:'{}'})).status,404);
});

test('deletion refuses an active related research without partially deleting files and succeeds after it settles',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'prism-delete-active-')),store=new Store(directory),root=await store.save({...demoSpace(),mode:'live'});
 let release;const waiting=new Promise(resolve=>{release=resolve;});
 const server=createApp({directory,env:{},io:{async model(){return {action:'finish',settings:demoSpace().settings,candidates:[{name:'Software fixture',facts:{}}]};},async search(){await waiting;return [];}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{release();await server.shutdown();await rm(directory,{recursive:true,force:true});});
 const response=await fetch(base+'/api/spaces/'+root.id+'/research',{method:'POST',body:'{}'}),job=await response.json();assert.equal(response.status,202);
 const refused=await fetch(base+'/api/spaces/'+root.id,{method:'DELETE'});assert.equal(refused.status,409);assert.match((await refused.json()).error,/研究任务运行/);
 assert.equal((await fetch(base+'/api/spaces/'+root.id)).status,200);assert.ok(await readFile(join(directory,'jobs',job.id+'.json')));
 release();
 for(let i=0;i<150;i++){const current=await(await fetch(base+'/api/jobs/'+job.id)).json();if(current.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal((await fetch(base+'/api/spaces/'+root.id,{method:'DELETE'})).status,200);assert.equal((await fetch(base+'/api/jobs/'+job.id)).status,404);
});

test('a version save queued behind deletion cannot resurrect its deleted parent',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'prism-delete-race-')),store=new Store(directory),root=await store.save(housingDemo());
 t.after(()=>rm(directory,{recursive:true,force:true}));
 let entered,release;const deleting=new Promise(r=>{entered=r;}),barrier=new Promise(r=>{release=r;});
 const removed=store.deleteRoot(root.id,{beforeDelete:async()=>{entered();await barrier;return {};}});await deleting;
 const rejected=assert.rejects(store.save(housingDemo(),root),{code:'ENOENT'});release();await removed;await rejected;
 assert.deepEqual(await store.list(),[]);assert.equal(store.rootWrites.size,0);
});
