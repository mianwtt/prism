import {safeUrl} from './evidence.mjs';
import {candidateSources} from './source-extraction.mjs';
import {isMerchantProduct,merchantPlatform} from './source-types.mjs';
import {searchRetrievedAt,searchCacheMetadata} from './search-cache.mjs';

export function merchantSearchPlans(name){
 const plans=[['京东','jd.com'],['天猫','detail.tmall.com'],['淘宝','item.taobao.com'],['苏宁','suning.com']];
 const brand=/华为|matebook|huawei/i.test(name)?['华为商城','vmall.com']:/联想|thinkbook|thinkpad|lenovo/i.test(name)?['联想商城','item.lenovo.com.cn']:/苹果|macbook|apple/i.test(name)?['Apple 商店','apple.com.cn/shop']:null;
 if(brand)plans.unshift(brand);
 return plans.map(([platform,site])=>({platform,query:`${platform==='淘宝'||platform==='天猫'?name.replace(/\s*[(（].*/,'').trim():name} site:${site}`,merchantOnly:true}));
}

// Discovery and per-product verification have separate, explicit budgets.
export async function gatherCandidateSources(candidates,originalSources,io,progress=()=>{}) {
  const sources=structuredClone(originalSources),warnings=[];
  let searches=0;
  if(typeof io.searchCandidateSources!=='function')return {sources,warnings,searches};
  for(const candidate of candidates.slice(0,3)) {
    const name=String(candidate.name||'').trim().slice(0,180);
    if(!name)continue;
    const linked=candidateSources(candidate,sources);
    if(linked.some(isMerchantProduct) && ['price','memory','weight'].every(k=>candidate.facts?.[k]?.status==='confirmed'&&Number.isFinite(candidate.facts[k].value)))continue;
    const plans=merchantSearchPlans(name);
    for(let offset=0;offset<plans.length;) {
      const batch=plans.slice(offset,offset+2);
      const outcomes=await Promise.allSettled(batch.map(plan=>{
        searches++;progress(`${plan.platform} 商品页补查 ${searches}/18：${plan.query}`);
        return Promise.resolve().then(()=>io.searchCandidateSources(plan.query));
      }));
      for(const [index,outcome]of outcomes.entries()){
        const {query,merchantOnly,platform}=batch[index];
        if(outcome.status==='rejected'){warnings.push(`${name}：${platform}检索失败，保留其他平台来源。`);continue;}
        const results=outcome.value;
        let added=0;
        for(const result of (results||[]).slice(0,6)){
          const url=safeUrl(result.url),text=String(result.raw_content||result.content||'').slice(0,20000);
          if(!url||!text.trim())continue;
          if(merchantOnly&&!isMerchantProduct(url))continue;
          const existing=sources.find(s=>s.url===url);
          if(existing){
            existing.retrieval={...existing.retrieval,engine:result.engine||existing.retrieval?.engine||'未记录',query,platform:merchantPlatform(url),sourceType:isMerchantProduct(url)?'merchant':'supplement'};
            if(result.raw_content&&text.length>existing.text.length){existing.text=text;existing.kind='page';existing.retrievedAt=searchRetrievedAt(result);existing.retrieval={...existing.retrieval,...searchCacheMetadata(result)};}
            continue;
          }
          let id='target-'+(sources.length+1);while(sources.some(s=>s.id===id))id+='x';
          sources.push({id,url,title:String(result.title||url).slice(0,200),text,kind:result.raw_content?'page':'search-excerpt',retrievedAt:searchRetrievedAt(result),
            retrieval:{engine:result.engine||'未记录',platform:merchantPlatform(url),sourceType:isMerchantProduct(url)?'merchant':'supplement',query,bodyChars:result.raw_content?text.length:0,snippetOnly:!result.raw_content,deadlineHit:result.retrieval?.deadlineHit===true,...searchCacheMetadata(result)}});
          added++;
        }
        progress(`${platform} · ${name}：本次新增 ${added} 个来源；价格和配置仍需检查`);
      }
      offset+=batch.length;
      if(offset>=plans.length&&plans.every(p=>p.merchantOnly)&&!candidateSources(candidate,sources).some(s=>isMerchantProduct(s)&&s.kind==='page'&&s.text.length>500&&/\d+\s*GB/i.test(s.text))){
        progress(`${name}：商品页参数不足，回退补查规格资料`);
        plans.push({platform:'规格补充',merchantOnly:false,query:`${name} 参数 内存 重量 规格`});
      }
    }
  }
  return {sources,warnings,searches};
}
