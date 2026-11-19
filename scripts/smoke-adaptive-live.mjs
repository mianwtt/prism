import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadSettings,publicSettings} from '../src/config.mjs';
import {providers} from '../src/research-providers.mjs';
import {runGeneralResearch} from '../src/general-research.mjs';
import {sourceSite} from '../src/decision-evidence.mjs';
import {evaluateDecision} from '../src/decision-schema.mjs';
const question=process.argv.slice(2).filter(x=>x!=='--').join(' ');
if(question.length<8||question.length>2000)throw new Error('Supply an 8–2000 character research question. This runs real model/search calls.');
const env={...process.env};loadSettings(resolve(env.PRISM_DATA_DIR||'data','provider-settings.json'),env);
if(!publicSettings(env).ready)throw new Error('Configure the research provider first; npm run doctor diagnoses local prerequisites.');
const live=providers(env),counts={model:0,search:0,read:0,images:0,offers:0,catalogs:0};
const start=Date.now(),directory=resolve(process.env.PRISM_EVALUATION_OUTPUT_DIR||resolve('work/general-live-evaluation',new Date().toISOString().replace(/[:.]/g,'-')));await mkdir(directory,{recursive:true});
const sourceHashes=Object.fromEntries(await Promise.all(['src/general-research.mjs','src/plan-constraints.mjs','src/candidate-diversity.mjs','src/research-recovery.mjs','src/catalog-navigation.mjs','src/public-rental-read.mjs','src/public-merchant-read.mjs','src/merchant-page-dom.mjs','src/decision-evidence.mjs','src/research-providers.mjs'].map(async path=>[path,createHash('sha256').update(await readFile(resolve(path))).digest('hex')])));
await writeFile(resolve(directory,'run-manifest.json'),JSON.stringify({kind:'live-research',sourceHashes,provider:env.SEARCH_PROVIDER,node:process.version},null,2));
const io={...live,...Object.fromEntries([['model','model'],['search','search'],['fetchSource','read'],['enrichImages','images'],['readMerchantOffer','offers'],['discoverProducts','catalogs'],['searchCatalog','catalogs']].filter(([method])=>typeof live[method]==='function').map(([method,counter])=>[method,async(...args)=>{
  const sequence=++counts[counter];
  try{const result=await live[method](...args);if(method==='model')await writeFile(resolve(directory,`model-${sequence}.json`),JSON.stringify(result,null,2));else await writeFile(resolve(directory,`${method}-${sequence}.json`),JSON.stringify({request:args[0],result},null,2));return result;}
  catch(error){await writeFile(resolve(directory,`${method}-${sequence}-error.json`),JSON.stringify({name:error.name,message:error.message},null,2));throw error;}
}]))};
try{
  const result=await runGeneralResearch(question,io,event=>console.log(JSON.stringify({node:event.node,message:event.message})));
  await writeFile(resolve(directory,'result.json'),JSON.stringify(result,null,2));
  const summary={at:new Date().toISOString(),status:'completed',seconds:(Date.now()-start)/1000,counts,sources:result.sources.length,sourceSites:[...new Set(result.sources.map(s=>sourceSite(s.url)))],candidates:result.candidates.length,eligible:evaluateDecision(result.candidates,result.settings,result.schema).filter(c=>c.status==='eligible').length,citedFields:result.candidates.reduce((sum,c)=>sum+Object.values(c.facts).filter(f=>f.status==='cited').length,0),conflictingFields:result.candidates.reduce((sum,c)=>sum+Object.values(c.facts).filter(f=>f.conflictingEvidence?.length).length,0),photos:result.candidates.filter(c=>c.media?.url).length,explicitIdentities:result.candidates.filter(c=>c.identity).length,meaning:'One live availability/extraction run. Fields and identity bindings still require manual checking; not an accuracy score.'};
  await writeFile(resolve(directory,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,savedUnder:directory},null,2));
}catch(error){await writeFile(resolve(directory,'summary.json'),JSON.stringify({status:'failed',seconds:(Date.now()-start)/1000,counts,errorType:error.name},null,2));console.log(JSON.stringify({status:'failed',errorType:error.name,savedUnder:directory}));process.exitCode=1;}
finally{live.close?.();}
