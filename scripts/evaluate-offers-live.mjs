import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
import {resolve} from 'node:path';
import {offerComparison} from '../src/product-offers.mjs';
import {evaluateDecision} from '../src/decision-schema.mjs';

// A reproducible live-task gate, separate from fixtures and software test counts.
// An existing saved space may be inspected without paying for another research.
const args=process.argv.slice(2),index=args.indexOf('--space');
const spaceId=index<0?null:args[index+1];
if(index>=0&&(!spaceId||!/^[a-f0-9-]{36}$/.test(spaceId)))throw new Error('--space 需要有效的空间 ID');
const base=new URL(process.env.PRISM_BASE_URL||'http://127.0.0.1:4317');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw new Error('验收脚本仅连接本机 Prism');
async function api(path,body){const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const result=await r.json();if(!r.ok)throw new Error(result.error||'HTTP '+r.status);return result;}
const health=await api('/api/health');if(!spaceId&&!health.live)throw new Error('请先连接模型与搜索服务');
const question=(index<0?args:args.filter((_,i)=>i!==index&&i!==index+1)).join(' ').trim()||'预算2000元，购买树莓派5的8GB单板，不要配件套装，比较不同商家的同款公开报价，保留原页配图和来源。';
let job=null,id=spaceId;
if(!id){
  job=await api('/api/research',{question,adaptive:true});let last='';const deadline=Date.now()+8*60000;
  while(job.status==='running'){
    if(Date.now()>deadline)throw new Error('验收等待超时；研究仍保留在工作台，可继续查看');
    await setTimeout(2000);job=(await api('/api/jobs')).find(j=>j.id===job.id);if(!job)throw new Error('研究任务丢失');
    const event=job.events?.at(-1);if(event?.message&&event.message!==last){last=event.message;console.log(last);}
  }
  if(job.status!=='complete')throw new Error(job.error||'研究未完成');id=job.resultId;
}
const space=await api('/api/spaces/'+id);
if(space.mode==='demo')throw new Error('演示资料不能作为真实任务验收');
const scenario=space.scenarios.find(s=>s.id===space.activeScenarioId)||space.scenarios[0],pool=space.candidates.filter(c=>scenario.candidateIds.includes(c.id)),rows=evaluateDecision(pool,scenario.settings,space.schema);
const eligible=new Set(rows.filter(r=>r.status==='eligible').map(r=>r.id));
const comparisons=pool.filter(c=>eligible.has(c.id)).map(c=>({candidateId:c.id,name:c.name,selectedOfferId:c.commerce?.selectedOfferId,comparison:offerComparison(c,space.sources,space.schema)})).filter(x=>x.comparison?.identity&&x.comparison.sourceCount>=2&&new Set(x.comparison.offers.filter(o=>o.comparable).map(o=>new URL(o.url).hostname.replace(/^www\./,''))).size>=2);
if(!comparisons.length)throw new Error('没有符合条件、同配置且至少两个站点可核对的报价；未通过真实任务验收');
const directory=resolve('work/offer-acceptance',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(directory,{recursive:true});
const result={observedAt:new Date().toISOString(),spaceId:id,question:space.question,jobId:job?.id||null,inspectedSavedSpace:Boolean(spaceId),comparisons,meaning:'已保存页面的同款报价验收；不代表结算价、库存保证或市场覆盖率'};
await writeFile(resolve(directory,'result.json'),JSON.stringify(result,null,2));await writeFile(resolve(directory,'space.json'),JSON.stringify(space,null,2));
console.log(JSON.stringify({status:'passed',spaceId:id,matchedProducts:comparisons.length,offers:comparisons.map(c=>({name:c.name,prices:c.comparison.offers.filter(o=>o.comparable).map(o=>({seller:o.seller,price:o.price,url:o.url}))})),savedUnder:directory},null,2));
