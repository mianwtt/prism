import {randomUUID} from 'node:crypto';
import {safeUrl} from './evidence.mjs';
import {attachRentalPage} from './public-rental-read.mjs';
import {attachMerchantPage} from './public-merchant-read.mjs';

export async function readCatalogWithRetry(request,io,{attempts=2,onRetry=()=>{}}={}){
  for(let attempt=0;attempt<Math.min(2,Math.max(1,attempts));attempt++)try{return await io.searchCatalog(request);}
  catch(error){
    const transient=/\b(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND)\b|超时|timed?\s*out|timeout|(?:HTTP|status)\s*5\d{2}\b/i.test(String(error?.message||error));
    if(!transient||attempt+1>=Math.min(2,Math.max(1,attempts)))throw error;
    onRetry();
  }
}

export function catalogRequestForConditions(request,contract,platforms=[]){
  const capabilities=platforms.find(p=>p.platform===request.platform)?.capabilities||[];
  if(!capabilities.includes('price-range'))return request;
  const fields=contract.schema.fields.filter(f=>(f.type||'number')==='number'&&f.direction===-1&&/^(?:元|CNY|人民币)$/i.test(f.unit)&&/价格|售价|标价|报价|费用|预算|price|cost/i.test([f.label,...(f.aliases||[])].join(' '))&&Number.isFinite(contract.settings.limits[f.key]));
  if(fields.length!==1)return request;
  return {...request,priceRange:{minimum:0,maximum:contract.settings.limits[fields[0].key]}};
}

// Follow public navigation actually exposed by a reader. A model chooses the
// useful filter; the application never constructs a price/location filter URL.
export async function refineObservedCatalogs(sources,contract,io,{question='',event=()=>{},limit=3}={}){
  const visited=new Set(sources.map(s=>s.url)),fresh=[];let frontier=sources,selection=0,read=0;
  if(typeof io.fetchSource!=='function')return {sources:[],calls:{selection,read}};
  while(read<Math.min(3,limit)){
    const seen=new Set(visited),links=[];
    for(const source of frontier)for(const link of source.observedCatalogLinks||[]){const url=safeUrl(link.url);if(url&&!seen.has(url)){seen.add(url);links.push({...link,url});}}
    if(!links.length)break;
    let urls=[];for(let attempt=0;attempt<2;attempt++)try{
      selection++;const answer=await io.model([{role:'system',content:'Choose up to 3 observed catalog filter URLs across this navigation. For THIS step choose ONE URL; I will supply the resulting page so another filter can build on the first. 只从links选一个链接，优先满足全部硬性条件的范围；先选类型后，在新页选择保留该类型的价格筛选。如果已先选价格，进入类型页后还可以沿实际新链接重新选价格，最多三步，不猜组合路径。预算以内的区间优先于跨越预算的区间。不改用户要求，不跳城市，不猜URL。Return JSON {urls:["observed URL"]}; if all useful filters are already applied, return urls:[].'},
        {role:'user',content:JSON.stringify({question,fields:contract.schema.fields,settings:contract.settings,currentCatalogs:frontier.map(s=>({url:s.url,title:s.title,examples:s.observedLinks?.slice(0,2)})),links:links.slice(0,30),...(attempt?{validationFeedback:'Use an array containing one exact links[].url string only.'}:{})})}]);
      if(!Array.isArray(answer?.urls))throw new Error('invalid-selection');
      urls=[...new Set(answer.urls)].filter(u=>typeof u==='string'&&links.some(l=>l.url===u)).slice(0,1);
      if(answer.urls.length&&!urls.length)throw new Error('unobserved-selection');break;
    }catch{}
    if(!urls.length)break;
    const url=urls[0];visited.add(url);read++;event('正在按你的条件打开平台已有的筛选目录。');
    try{
      const page=await io.fetchSource(url),text=typeof page==='string'?page:page?.text||page?.raw_content;if(!text)break;
      const source={id:'source-'+randomUUID().slice(0,12),url,title:page?.title||'筛选目录',text:text.slice(0,30000),kind:'page',retrievedAt:page?.observedAt||new Date().toISOString()};
      attachRentalPage(source,page);attachMerchantPage(source,page);fresh.unshift(source);frontier=[source];
    }catch{break;}
  }
  return {sources:fresh,calls:{selection,read}};
}
