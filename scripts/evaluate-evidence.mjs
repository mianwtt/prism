import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {validateDecisionSchema} from '../src/decision-schema.mjs';
import {checkDecisionCandidates} from '../src/general-research.mjs';
const corpus=JSON.parse(await readFile(new URL('../tests/fixtures/decision-evidence-corpus.json',import.meta.url),'utf8'));
export function evaluateCorpus(corpus) {
  return corpus.map(item=>{
    const schema=validateDecisionSchema({fields:[item.field]}),source={id:'fixture',title:item.title||'测试方案甲',text:item.sourceText||'测试方案甲 '+item.quote,url:'https://example.org/fictional-validation-fixture'};
    const result=checkDecisionCandidates([{name:'测试方案甲',sourceId:source.id,facts:{[item.field.key]:{value:item.value,quote:item.quote,sourceId:source.id}}}],[source],schema);
    const accepted=result.candidates.some(c=>c.facts[item.field.key]?.value===item.value);
    return {id:item.id,expected:item.accept,accepted,pass:accepted===item.accept};
  });
}
const cases=evaluateCorpus(corpus),passed=cases.filter(c=>c.pass).length;
const summary={kind:'fictional-regression-corpus',cases:cases.length,passed,failed:cases.length-passed,expectedAccepted:corpus.filter(c=>c.accept).length,expectedRejected:corpus.filter(c=>!c.accept).length,meaning:'Tests typed quotation gates only, not LLM extraction accuracy, source truth or web recall'};
await mkdir(new URL('../work/evidence-evaluation/',import.meta.url),{recursive:true});
await writeFile(new URL('../work/evidence-evaluation/latest.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),summary,cases},null,2));
console.log(JSON.stringify(summary,null,2));if(passed!==cases.length){console.log(JSON.stringify(cases.filter(c=>!c.pass),null,2));process.exitCode=1;}
