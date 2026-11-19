import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {runGeneralResearch} from '../src/general-research.mjs';
import {evaluateDecision} from '../src/decision-schema.mjs';
import {recoveryCases,recoveryFixture} from '../tests/fixtures/recovery-cases.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2).filter(arg=>arg!=='--');
if(args.length&&!(args.length===2&&args[0]==='--baseline-ref'&&/^[a-f0-9]{7,40}$/i.test(args[1])))throw new Error('Usage: npm run evaluate:recovery -- [--baseline-ref COMMIT]');
const directory=resolve(root,'work/recovery-evaluation');await mkdir(directory,{recursive:true});
const variants=[{name:'current',run:runGeneralResearch}];let baseline=null;
if(args.length){
  const revision=execFileSync('git',['rev-parse','--verify',args[1]+'^{commit}'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const source=execFileSync('git',['show',revision+':src/general-research.mjs'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  // Compare graph/recovery logic under the same installed dependencies and controlled providers.
  const rewritten=source.replace(/from '(\.\/[^']+)'/g,(_,path)=>"from '"+new URL('../src/'+path.slice(2),import.meta.url).href+"'");
  const path=resolve(directory,'baseline-'+revision+'.mjs');await writeFile(path,rewritten);
  variants.unshift({name:'baseline',run:(await import(pathToFileURL(path).href)).runGeneralResearch});
  baseline={revision,scope:'baseline graph with current shared modules, dependencies and fixtures',graphSha256:createHash('sha256').update(source).digest('hex')};
}
const trials=[];
for(const spec of recoveryCases){
  for(const variant of variants){
    const fixture=recoveryFixture(spec),start=performance.now();
    try{
      const result=await variant.run(fixture.question,fixture.io);
      const eligible=evaluateDecision(result.candidates,result.settings,result.schema).filter(row=>row.status==='eligible').length;
      const expectedRejected=spec.control==='reject';
      trials.push({case:spec.id,domain:spec.domain,kind:spec.control||'recovery',variant:variant.name,
        eligible,candidates:result.candidates.length,pass:expectedRejected?eligible===0:eligible>=3,
        calls:{...fixture.counters},repeatedPageReads:fixture.reads.length-new Set(fixture.reads).size,
        recovery:result.agent.recovery||null,elapsedMs:Math.round((performance.now()-start)*1000)/1000});
    }catch(error){trials.push({case:spec.id,kind:spec.control||'recovery',variant:variant.name,pass:false,errorType:error.name,calls:{...fixture.counters}});}
  }
}
const summary=variants.map(variant=>{const rows=trials.filter(row=>row.variant===variant.name),positive=rows.filter(row=>row.kind==='recovery');
  return {variant:variant.name,passed:rows.filter(row=>row.pass).length,total:rows.length,recoveryTargetsMet:positive.filter(row=>row.pass).length,recoveryCases:positive.length,
    modelCalls:rows.reduce((n,row)=>n+row.calls.model,0),searchCalls:rows.reduce((n,row)=>n+row.calls.search,0),pageReads:rows.reduce((n,row)=>n+row.calls.read,0),
    repeatedPageReads:rows.reduce((n,row)=>n+(row.repeatedPageReads||0),0)};});
const sources=['src/general-research.mjs','src/research-recovery.mjs','src/public-rental-read.mjs','src/decision-evidence.mjs','tests/fixtures/recovery-cases.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')])));
const result={kind:'controlled-recovery-regression-replay',at:new Date().toISOString(),baseline,sourceHashes,summary,trials,
  meaning:'Constructed fixtures reproduce specific recovery defects. These are not live tasks, a held-out quality benchmark, or a general Agent success rate.'};
await writeFile(resolve(directory,'latest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({summary,meaning:result.meaning,savedUnder:'work/recovery-evaluation/latest.json'},null,2));
if(trials.some(row=>row.variant==='current'&&!row.pass))process.exitCode=1;
