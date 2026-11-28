import {randomUUID} from 'node:crypto';
import {collectedSource} from './general-retrieval.mjs';
import {attachProductPage,structuredProductCandidate} from './public-product-page.mjs';
import {attachMerchantPage,merchantRawCandidate} from './public-merchant-read.mjs';
import {productDescriptor,sameProduct,offerPriceField,offerComparison} from './product-offers.mjs';
import {sourceSite} from './decision-evidence.mjs';

async function batches(items,parallel,run,canContinue=()=>true){for(let i=0;i<items.length&&canContinue();i+=parallel)await Promise.all(items.slice(i,i+parallel).map(run));}
export function explicitProductUrls(question){
  const result=[];for(const m of String(question||'').matchAll(/https:\/\/[^\s<>"'，。；）)]+/g))try{const u=new URL(m[0]);if(u.username||u.password||u.port||!u.hostname.includes('.')||/^[\d.]+$|localhost|\.(?:local|internal|test|invalid)$/.test(u.hostname))continue;if(!result.includes(u.href))result.push(u.href);}catch{}return result.slice(0,4);
}
export function offerQueries(candidate,source){
  const p=productDescriptor(source);if(!p?.identity)return [];
  const terms=[p.brand.replace(/\([^)]*\)/g,''),p.modelLabel||p.model||p.gtin,p.configuration.memory,p.configuration.storage].filter(Boolean).join(' ').slice(0,140),host=sourceSite(source.url);
  const targets=(p.category==='single-board-computer'?['dfrobot.com.cn','waveshare.net','jd.com']:['jd.com','tmall.com','suning.com']).filter(h=>h!==host).slice(0,2);
  return [{query:terms+' 商品 报价 -site:'+host,intent:'跨站发现'},...targets.map(site=>({query:terms+' site:'+site,intent:'核对其他商家'}))];
}
// Expands an already observed exact configuration, not a model-invented shortlist.
// All discoveries are re-read; summaries never become offer observations.
export async function researchComparableOffers({candidates,sources,schema},io,{event=()=>{},maxProducts=3,maxSearches=6,maxReads=10,maxDurationMs=160000,exactOnly=false}={}){
  if(!offerPriceField(schema)||!io.search||!io.fetchSource)return {sources:[],raw:[],coverage:null};
  const targets=candidates.filter(c=>productDescriptor(sources.find(s=>s.id===c.sourceId))?.identity).slice(0,maxProducts);
  if(!targets.length)return {sources:[],raw:[],coverage:null};
  const started=Date.now(),canContinue=()=>Date.now()-started<maxDurationMs;
  const plans=targets.map(c=>offerQueries(c,sources.find(s=>s.id===c.sourceId)).map(q=>({...q,candidateId:c.id}))),searches=[];
  for(let i=0;i<3;i++)for(const plan of plans)if(plan[i]&&searches.length<maxSearches)searches.push(plan[i]);
  const discovered=[],errors=[];
  event('已核对具体配置，继续跨站查找同款报价与购买条件。');
  // Shop-native catalogues complement general search. They expose actual item
  // URLs even when a search engine ignores site filters or has a stale index.
  let catalogs=0;
  if(typeof io.searchCatalog==='function')for(const candidate of targets){
    const original=sources.find(s=>s.id===candidate.sourceId),product=productDescriptor(original);
    if(product.category!=='single-board-computer'||!canContinue())continue;
    const platforms=(io.publicCatalogs||[]).filter(p=>p.capabilities?.includes('electronics-components')&&p.input==='keywords');
    await batches(platforms.slice(0,2),2,async platform=>{
      catalogs++;
      try{const page=await io.searchCatalog({platform:platform.platform,keywords:[product.modelLabel||product.model,product.configuration.memory].filter(Boolean).join(' ').slice(0,40)});
        const tokens=[product.configuration.memory,product.modelLabel||product.model].filter(Boolean).map(s=>s.toLowerCase().replace(/[\s-]/g,''));
        const relevance=link=>tokens.reduce((n,t)=>n+Number(link.title.toLowerCase().replace(/[\s-]/g,'').includes(t)),0);
        for(const link of [...(page?.observedLinks||[])].sort((a,b)=>relevance(b)-relevance(a)).slice(0,6))if(page.text?.includes(link.url)&&!sources.some(s=>s.url===link.url)){
          const row=collectedSource({url:link.url,title:link.title,content:link.title},'同款公开目录');
          if(row)discovered.push({...row,forCandidate:candidate.id,catalogLead:true});
        }
      }catch{errors.push('商家目录');}
    },canContinue);
  }
  await batches(searches,3,async request=>{
    try{const rows=await io.search(request.query,{purpose:'offers',maxResults:10});
      for(const row of Array.isArray(rows)?rows:[]){const source=collectedSource(row,request.query);if(source&&!sources.some(s=>s.url===source.url))discovered.push({...source,forCandidate:request.candidateId});}
    }catch{errors.push(request.intent);}
  },canContinue);
  const bySite=new Map(),seen=new Set();for(const row of discovered.sort((a,b)=>Number(Boolean(b.catalogLead))-Number(Boolean(a.catalogLead)))){if(seen.has(row.url))continue;seen.add(row.url);const site=sourceSite(row.url);if(!bySite.has(site))bySite.set(site,[]);bySite.get(site).push(row);}
  const selected=[];while(selected.length<maxReads&&[...bySite.values()].some(g=>g.length))for(const group of bySite.values())if(group.length&&selected.length<maxReads)selected.push(group.shift());
  const fresh=[];let reads=0;
  await batches(selected,3,async row=>{
    reads++;try{const page=await io.fetchSource(row.url),text=typeof page==='string'?page:page?.text||page?.raw_content;if(!text)return;
      // A cross-site redirect is not allowed to impersonate the discovered seller.
      const effective=page?.url||row.url;if(sourceSite(effective)!==sourceSite(row.url))return;
      const source={...row,id:'source-'+randomUUID().slice(0,12),url:effective,text:text.slice(0,30000),title:page?.title||row.title,kind:'page',retrievedAt:page?.observedAt||new Date().toISOString()};
      attachProductPage(source,page);attachMerchantPage(source,page);fresh.push(source);
    }catch{errors.push('详情读取');}
  },canContinue);
  const all=[...sources,...fresh],matched=targets.map(c=>offerComparison(c,all,schema));
  event('同款比价完成：只将已读取且配置一致的报价并列；未能核对的来源保持待确认。');
  const targetProducts=targets.map(c=>productDescriptor(sources.find(s=>s.id===c.sourceId)));
  const candidateSources=fresh.filter(s=>(s.merchantObservation||s.productObservation)&&(!exactOnly||targetProducts.some(p=>sameProduct(p,productDescriptor(s)))));
  return {sources:fresh,raw:candidateSources.map(s=>s.productObservation?structuredProductCandidate(s,schema):merchantRawCandidate(s,schema)).filter(Boolean),coverage:{products:targets.length,searches:searches.length,catalogs,discovered:seen.size,read:reads,matchedSources:new Set(matched.flatMap(c=>c?.matchedSourceIds||[])).size,errors:errors.length}};
}
