import { existsSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadSettings, publicSettings, configured } from '../src/config.mjs';
import { tofuPython } from '../src/tofu-search.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const env={...process.env}, directory=resolve(root,env.PRISM_DATA_DIR||'data');
let errors=0;
const report=(ok,label,detail='')=>{console.log(`${ok?'OK':'FIX'}  ${label}${detail?' — '+detail:''}`);if(!ok)errors++;};
console.log('Prism local setup diagnosis (credentials are never printed)\n');
const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
report(nodeMajor>22||(nodeMajor===22&&nodeMinor>=9),'Node.js',process.versions.node+'; requires 22.9+ (24 recommended)');
for(const dependency of ['@langchain/langgraph','@langchain/ollama','zod']){
  try{await import(dependency);report(true,dependency);}catch{report(false,dependency,'Run npm ci');}
}
try{let target=directory;while(!existsSync(target))target=dirname(target);await access(target,constants.W_OK);report(true,'Local data directory writable');}catch{report(false,'Local data directory','Choose a writable PRISM_DATA_DIR');}
try{loadSettings(resolve(directory,'provider-settings.json'),env);}catch{report(false,'Saved configuration','Invalid JSON: correct data/provider-settings.json');}
const settings=publicSettings(env);
console.log('\nThe offline demos work without the following optional research configuration.');
report(configured(env.LLM_MODEL)&&configured(env.LLM_API_KEY),'Research model','Configure Research Settings; local Ollama accepts ollama as its key');
let modelUrl;
try{modelUrl=new URL(env.LLM_BASE_URL||'https://api.openai.com/v1');if(modelUrl.username||modelUrl.password||modelUrl.search||modelUrl.hash||!['http:','https:'].includes(modelUrl.protocol))throw new Error();report(true,'Model endpoint format');}catch{report(false,'Model endpoint format','Set a valid Base URL in Research Settings');}
if(settings.searchProvider==='tofu'){
  const python=tofuPython(env);
  if(existsSync(python)){
    const probe=spawnSync(python,['-c','import tofu_search; print("tofu-search importable")'],{encoding:'utf8',timeout:15000,windowsHide:true});
    report(probe.status===0,'Local tofu runtime',probe.status===0?'Python package loads':'Run npm run setup:search');
  }else report(false,'Local tofu runtime','Install uv, then run npm run setup:search');
}else report(settings.hasSearchKey,'Tavily configuration','Choose tofu for no commercial search key, or configure a Tavily key');
if(process.argv.includes('--connect')&&modelUrl&&configured(env.LLM_API_KEY)){
  try{
    const result=await fetch(modelUrl.href.replace(/\/$/,'')+'/models',{headers:{Authorization:'Bearer '+env.LLM_API_KEY},signal:AbortSignal.timeout(8000)});
    report(result.ok,'Model service connectivity',`HTTP ${result.status}; no inference requested`);
  }catch{report(false,'Model service connectivity','Cannot reach the configured service; check Ollama and proxy settings');}
}else console.log('\nAdd --connect to check the model /models endpoint (no inference or search).');
console.log(`\n${errors?'Research setup needs attention; offline demos remain available.':'Local prerequisites passed. This does not establish web-search quality.'}`);
process.exitCode=errors?1:0;
