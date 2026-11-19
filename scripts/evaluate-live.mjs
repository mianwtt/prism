import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {loadSettings,publicSettings} from '../src/config.mjs';
import {assessResearchTask} from './lib/research-acceptance.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2).filter(v=>v!=='--');
const options={};for(let i=0;i<args.length;i+=2){if(!['--only','--suite'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: npm run evaluate:live -- [--suite original|extended] [--only C01,R01]');options[args[i]]=args[i+1];}
const suiteName=options['--suite']||'original';if(!['original','extended'].includes(suiteName))throw new Error('Unknown suite');
if(options['--only']&&!/^[CRE]\d\d(?:,[CRE]\d\d)*$/.test(options['--only']))throw new Error('Invalid task IDs');
const suitePath=resolve(root,'tests/fixtures/'+(suiteName==='extended'?'research-acceptance-extended.json':'research-acceptance-tasks.json')),suiteBytes=await readFile(suitePath),suite=JSON.parse(suiteBytes);
const selected=options['--only']?options['--only'].split(','):suite.tasks.map(t=>t.id);
if(new Set(selected).size!==selected.length||selected.some(id=>!suite.tasks.some(t=>t.id===id)))throw new Error('Unknown or duplicated task ID');
const tasks=selected.map(id=>suite.tasks.find(t=>t.id===id));
const sha=value=>createHash('sha256').update(value).digest('hex');
async function runtimeFingerprint(){
  const paths=(await readdir(resolve(root,'src'),{recursive:true})).filter(p=>p.endsWith('.mjs')).map(p=>'src/'+p.replaceAll('\\','/'));
  paths.push('package-lock.json','scripts/evaluate-live.mjs','scripts/smoke-adaptive-live.mjs','scripts/lib/research-acceptance.mjs',suiteName==='extended'?'tests/fixtures/research-acceptance-extended.json':'tests/fixtures/research-acceptance-tasks.json');paths.sort();
  return sha(JSON.stringify(await Promise.all(paths.map(async p=>[p,sha(await readFile(resolve(root,p)))]))));
}
function configuration(){const env={...process.env};loadSettings(resolve(env.PRISM_DATA_DIR||resolve(root,'data'),'provider-settings.json'),env);return env;}
function configFingerprint(){const env=configuration();return sha(JSON.stringify([env.LLM_BASE_URL||'',env.LLM_MODEL||'',env.SEARCH_PROVIDER||'',env.TOFU_PYTHON||'',env.PRISM_BROWSER_CHANNEL||'chrome']));}
const settings=publicSettings(configuration());if(!settings.ready)throw new Error('Configure the local model and search provider before running real research.');
const runtimeHash=await runtimeFingerprint(),configHash=configFingerprint(),runId=new Date().toISOString().replace(/[:.]/g,'-');
const directory=resolve(root,'work/live-acceptance',runId);await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,'tasks.json'),suiteBytes);
await writeFile(resolve(directory,'manifest.json'),JSON.stringify({kind:'fixed-live-acceptance',at:new Date().toISOString(),taskIds:selected,
  suiteName,suiteSha256:sha(suiteBytes),runtimeHash,configHash,node:process.version,provider:settings.searchProvider,applicationSearchCache:'disabled for this evaluation only',
  perTaskTimeoutMs:360000,meaning:suite.meaning},null,2));
const trials=[];
async function save(status){await writeFile(resolve(directory,'summary.json'),JSON.stringify({kind:'fixed-live-acceptance',status,taskIds:selected,
  completed:trials.length,passed:trials.filter(t=>t.pass).length,failed:trials.filter(t=>!t.pass).length,runtimeHash,configHash,trials},null,2));}
console.log(JSON.stringify({event:'suite-start',runId,tasks:selected,realModelAndSearch:true}));await save('running');
async function worker(task,output){
  const out=createWriteStream(resolve(output,'stdout.log')),err=createWriteStream(resolve(output,'stderr.log'));
  const child=spawn(process.execPath,['--env-file-if-exists=.env',resolve(root,'scripts/smoke-adaptive-live.mjs'),task.question],
    {cwd:root,windowsHide:true,env:{...process.env,REDIS_URL:'XXX',PRISM_EVALUATION_OUTPUT_DIR:output},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(out);child.stderr.pipe(err);let lines='',lastStage='';
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{lines+=chunk;let at;
    while((at=lines.indexOf('\n'))>=0){const line=lines.slice(0,at);lines=lines.slice(at+1);try{const e=JSON.parse(line);if(typeof e.node==='string'&&e.node!==lastStage){lastStage=e.node;console.log(JSON.stringify({event:'stage',task:task.id,node:e.node}));}}catch{}}
  });
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill();},360000);
  const code=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',resolve);});clearTimeout(timer);
  await Promise.all([finished(out),finished(err)]);
  return {exitCode:code,timedOut};
}
async function checkImages(rows){
  const targets=rows.filter(row=>row.qualified).slice(0,12);if(!targets.length)return {checked:0,loaded:0,loadedCandidateIds:[]};
  let browser;
  try{
    browser=await chromium.launch({channel:process.env.PRISM_BROWSER_CHANNEL||'chrome',headless:true});const page=await browser.newPage();
    const loaded=await page.evaluate(async urls=>await Promise.all(urls.map(url=>new Promise(resolve=>{const img=new Image(),timer=setTimeout(()=>resolve(false),15000);
      img.referrerPolicy='no-referrer';img.onload=()=>{clearTimeout(timer);resolve(img.naturalWidth>0&&img.naturalHeight>0);};img.onerror=()=>{clearTimeout(timer);resolve(false);};img.src=url;}))),targets.map(row=>row.imageURL));
    return {checked:targets.length,loaded:loaded.filter(Boolean).length,loadedCandidateIds:targets.filter((_,i)=>loaded[i]).map(row=>row.id)};
  }catch{return {checked:targets.length,loaded:0,loadedCandidateIds:[],errorType:'image-check-unavailable'};}
  finally{await browser?.close();}
}
for(const task of tasks){
  if(await runtimeFingerprint()!==runtimeHash||configFingerprint()!==configHash){await save('stopped-runtime-or-config-changed');console.log(JSON.stringify({event:'stopped',reason:'runtime-or-config-changed'}));process.exitCode=1;break;}
  const output=resolve(directory,task.id);await mkdir(output,{recursive:true});const started=Date.now();
  console.log(JSON.stringify({event:'task-start',task:task.id}));const execution=await worker(task,output);
  let result=null,summary=null;try{result=JSON.parse(await readFile(resolve(output,'result.json'),'utf8'));}catch{}
  try{summary=JSON.parse(await readFile(resolve(output,'summary.json'),'utf8'));}catch{}
  const acceptance=assessResearchTask(task,result,{minimum:suite.minimumQualifiedCandidates}),images=await checkImages(acceptance.rows);
  await writeFile(resolve(output,'acceptance.json'),JSON.stringify({acceptance,images},null,2));
  const stable=await runtimeFingerprint()===runtimeHash&&configFingerprint()===configHash;
  const trial={id:task.id,domain:task.domain,...execution,runtimeStable:stable,pass:stable&&execution.exitCode===0&&acceptance.passed&&(!task.sourceImages||images.loaded>=suite.minimumQualifiedCandidates),
    seconds:summary?.seconds??(Date.now()-started)/1000,candidates:result?.candidates?.length||0,qualified:acceptance.qualified,sourceImagesLoaded:images.loaded,
    supportedFields:acceptance.supportedFields||0,totalRequestedFields:acceptance.totalRequestedFields||0,schemaCoverage:acceptance.schemaCoverage||0,requiredFields:task.criteria.length,
    calls:summary?.counts||{},errorType:summary?.errorType||null,meaning:acceptance.meaning||'No result'};
  trials.push(trial);await save(stable?'running':'stopped-runtime-or-config-changed');console.log(JSON.stringify({event:'task-complete',...trial}));
  if(!stable){process.exitCode=1;break;}
}
if(trials.length===tasks.length){await save('complete');console.log(JSON.stringify({event:'suite-complete',passed:trials.filter(t=>t.pass).length,total:tasks.length,savedUnder:'work/live-acceptance/'+runId}));if(trials.some(t=>!t.pass))process.exitCode=1;}
