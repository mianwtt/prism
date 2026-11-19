import {randomUUID} from 'node:crypto';
import {dimensionExcerpt,prioritizeSources,collectedSource,extractionPrompt} from './general-retrieval.mjs';
import {attachRentalPage,rentalRawCandidate} from './public-rental-read.mjs';
import {sourceSite} from './decision-evidence.mjs';
import {safeUrl} from './evidence.mjs';
import {attachMerchantPage,merchantRawCandidate} from './public-merchant-read.mjs';
import {catalogRequestForConditions} from './catalog-navigation.mjs';
import {normalizeCatalogRequests,catalogRequestKey} from './plan-constraints.mjs';

export function observedResearchLinks(records,{exclude=[]}={}) {
  const seen=new Set(exclude),links=[];
  const add=link=>{
    const url=safeUrl(link?.url);
    if(!url||seen.has(url)||/\/(?:login|signin|sign-in|passport|auth)(?:\/|$)/i.test(new URL(url).pathname))return;
    seen.add(url);links.push({...link,url});
  };
  for(const source of records){
    for(const link of source.observedLinks||[])add(link);
    for(const match of String(source.text||'').matchAll(/https?:\/\/[^\s<>"')\]]+/g)){
      const url=safeUrl(match[0]),parent=safeUrl(source.url);
      if(url&&parent&&new URL(url).hostname===new URL(parent).hostname)add({url,title:source.title});
    }
    for(const match of String(source.text||'').matchAll(/(?<!!)\[([^\]\n]{0,150})\]\(([^\s)]+)\)/g)){
      const parent=safeUrl(source.url);if(!parent||match[2].startsWith('#'))continue;
      try{const url=safeUrl(new URL(match[2],parent).href);
        if(url&&new URL(url).hostname===new URL(parent).hostname)add({url,title:match[1]||source.title});}catch{}
    }
  }
  return links;
}

// One bounded recovery. Use acquired pages before buying another search/model turn.
// The assessor is the same evidence/eligibility gate as the rest of the research graph.
export async function recoverResearch(state,io,{event,assess}) {
  const target=3,before=assess(state.raw||[],state.sources,state.contract);
  const calls={selection:0,rewrite:0,search:0,catalog:0,read:0,extract:0};
  if(before.comparable>=target)return {recovery:{strategy:'observed-navigation-v2',target,before,after:before,calls,stopReason:'not-needed'}};
  const sources=structuredClone(state.sources),raw=[...(state.raw||[])],trace=[...state.trace];
  const extracted=new Set(),attemptedUrls=new Set(sources.map(s=>s.url));
  let searchPageReads=0;
  const progress=()=>assess(raw,sources,state.contract);
  const enough=()=>progress().comparable>=target;
  const finish=()=>{const after=progress();return {sources,raw,trace,recovery:{strategy:'observed-navigation-v2',target,before,after,calls,
    stopReason:after.comparable>=target?'target-reached':calls.extract>=3||calls.read>=14||calls.selection>=4||calls.search+calls.catalog>=2?'budget-exhausted':'sources-exhausted'}};};
  trace.push(event('recover','可比较的不同选择还不够，我会先利用已找到的详情，再补查新的来源。'));

  function observed(records) {
    return observedResearchLinks(records,{exclude:attemptedUrls}).slice(0,24);
  }
  async function selectLinks(links,limit,prompt,{exploreUnknown=false}={}) {
    if(!links.length||typeof io.fetchSource!=='function')return [];
    let feedback=null;
    for(let attempt=0;attempt<2&&calls.selection<4;attempt++){
      calls.selection++;
      try{
        const answer=await io.model([{role:'system',content:prompt+' Match the requested object type first; components/accessories are not a substitute for the complete object. 优先补足不同实际配置；相同配置的配色或卖家变化不算新的独立选择，参考gaps.observedAlternatives和duplicateConfigurations避免重复。目录没写参数是打开详情核对的理由，不是排除理由。不要因重量、面积等未知而跳过所有同类对象；最终资格由详情证据判定。'+(attempt?' Repair the selection using validationFeedback. Return exactly JSON {urls:[...]} using supplied URLs.':'')},
          {role:'user',content:JSON.stringify({question:state.previous?.question||state.question,settings:state.contract.settings,
            fields:state.contract.schema.fields,gaps:progress(),links,validationFeedback:feedback})}]);
        if(!Array.isArray(answer?.urls))throw new Error('invalid-selection');
        const urls=[...new Set(answer.urls)].filter(url=>typeof url==='string'&&links.some(link=>link.url===url)).slice(0,limit);
        if(answer.urls.length&&!urls.length)throw new Error('invalid-selection');
        if(!urls.length&&exploreUnknown&&!attempt)throw new Error('empty-exploration');
        return urls;
      }catch{
        feedback='Use exact links[].url strings only. Unknown attributes in a catalog are not grounds to reject a potentially relevant object: open its detail page to verify. Only return empty if no object of the requested type is present; never invent URLs.';
      }
    }
    trace.push(event('recover','暂未选出有效的新详情，继续尝试其他公开来源。'));
    return [];
  }
  async function extractRecords(records) {
    const pending=records.filter(source=>!extracted.has(source.id));
    for(const source of pending.filter(source=>source.rentalObservation||source.merchantObservation)){
      extracted.add(source.id);
      const candidate=source.merchantObservation?merchantRawCandidate(source,state.contract.schema):rentalRawCandidate(source,state.contract.schema);if(candidate)raw.push(candidate);
    }
    if(enough())return;
    const pages=prioritizeSources(pending.filter(source=>!source.rentalObservation&&!source.merchantObservation&&!source.observedLinks?.length),state.contract.schema,6);
    for(let offset=0;offset<pages.length&&calls.extract<3&&!enough();offset+=2){
      const batch=pages.slice(offset,offset+2);batch.forEach(source=>extracted.add(source.id));
      for(let attempt=0;attempt<2&&calls.extract<3;attempt++){
        calls.extract++;
        try{
          const answer=await io.model([{role:'system',content:extractionPrompt(state.contract.schema,2)},
            {role:'user',content:JSON.stringify({question:state.previous?.question||state.question,gaps:progress(),
              ...(attempt?{validationFeedback:'The previous extraction failed or lacked a candidates array. Return a JSON object with candidates:[], using only evidence in these sources.'}:{}),
              sources:batch.map(source=>({...source,text:dimensionExcerpt(source.text,state.contract.schema)}))})}]);
          if(!Array.isArray(answer?.candidates))throw new Error('Invalid recovery extraction');
          raw.push(...answer.candidates.slice(0,2));break;
        }catch{trace.push(event('recover','一部分详情暂未能可靠整理，我会在本轮预算内重试或利用其他资料。'));}
      }
    }
  }
  async function readDetailUrls(urls) {
    for(let offset=0;offset<urls.length&&calls.read<14&&!enough();offset+=2){
      const batch=[];
      for(const url of urls.slice(offset,offset+2)){
        if(attemptedUrls.has(url)||calls.read>=14)continue;
        attemptedUrls.add(url);calls.read++;
        try{
          const page=await io.fetchSource(url),text=typeof page==='string'?page:page?.text||page?.raw_content;
          if(!text)continue;
          const source={id:'source-'+randomUUID().slice(0,12),url,title:'方案详情',text:text.slice(0,30000),kind:'page',retrievedAt:new Date().toISOString()};
          attachRentalPage(source,page);attachMerchantPage(source,page);attemptedUrls.add(source.url);sources.push(source);batch.push(source);
        }catch{}
      }
      await extractRecords(batch);
    }
  }

  const links=observed(sources);
  const selected=await selectLinks(links,6,'There are fewer than 3 comparable alternatives. Select up to 6 additional concrete detail URLs ONLY from these observed catalog rows. Prefer rows meeting ALL supplied conditions; include useful What-if alternatives when matches are scarce. Return JSON {urls:[]}. Never invent links or facts.');
  await readDetailUrls(selected);
  if(enough())return finish();

  const validCatalogRequest=r=>!r.keywords||r.keywords.length<=20&&!/(?:\d+(?:\.\d+)?\s*(?:kg\b|千克|公斤|元|CNY\b)|[¥￥]\s*\d|CNY\s*\d)/i.test(r.keywords);
  let queries=[],catalogRequests=[];calls.rewrite++;
  try{
    const answer=await io.model([{role:'system',content:'The first sources produced ZERO concrete, source-supported alternatives or too few fully comparable matches. Return JSON {queries:["at most 2 short alternative search queries"],catalogRequests:[]}. Use ONLY location + concrete category + a public platform name, under 35 characters. Remove numeric thresholds, photo/citation instructions and restrictive site: filters. Use gaps to focus on the actual missing evidence. Apply conditions after reading real details. Preserve the location/topic, use the supplied public-reader hints, avoid generic essays/news/encyclopedias/government navigation. Do not invent URLs. 若有适用的公开目录工具，优先用catalogRequests，最多2项。每项按平台声明的input使用实际字段，请求格式示例：'+JSON.stringify((io.publicCatalogs||[]).map(p=>({platform:p.platform,[p.input||'keywords']:p.input==='location'?'用户城市名':'简短商品类别'})))+'。location只写用户城市，不要使用keywords字段。根据已观察的超限原因调整商品查询，如太重则找便携类别，太贵则找价位更低的类别；可以保留明确要求的配置词，不猜品牌、不改条件、不重复已有结果的目录。若目录因网络问题没有取得结果，可以重试该目录。keywords最多20字符。没有相关目录工具时用queries。'},
      {role:'user',content:JSON.stringify({question:state.previous?.question||state.question,failedQueries:state.contract.queries,
        previousSites:[...new Set(sources.map(source=>sourceSite(source.url)))],publicReaders:io.publicReadHints||[],availablePublicCatalogs:io.publicCatalogs||[],initialCatalogRequests:state.contract.catalogRequests||[],observedCatalogRequests:sources.map(s=>s.retrieval?.catalogRequest).filter(Boolean),fields:state.contract.schema.fields,settings:state.contract.settings,gaps:progress()})}]);
    const seen=new Set();
    queries=(Array.isArray(answer?.queries)?answer.queries:[]).filter(q=>typeof q==='string'&&q.trim()&&q.length<=160)
      .map(q=>q.trim()).filter(q=>{const key=q.replace(/\s+/g,' ').toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,2);
    const identity=catalogRequestKey;
    const observedCatalogs=sources.map(s=>s.retrieval?.catalogRequest).filter(Boolean);
    const used=new Set((observedCatalogs.length?observedCatalogs:sources.some(s=>s.observedLinks?.length)?state.contract.catalogRequests||[]:[]).map(identity));
    catalogRequests=normalizeCatalogRequests(answer.catalogRequests,io.publicCatalogs).filter(validCatalogRequest).filter(r=>{const key=identity(r);if(used.has(key))return false;used.add(key);return true;});
  }catch{trace.push(event('recover','暂未得到新的有效检索词，已有资料保持保留。'));}

  // A new observation can change the next action. Replanning and repair share
  // four model turns (including format repair); catalogs/searches still share
  // two discoveries across the loop. A repaired first choice must not consume
  // the opportunity to act on the next observation.
  async function chooseCatalog(){
    if(typeof io.searchCatalog!=='function'||!state.contract.catalogRequests?.length)return [];
    const observedCatalogs=sources.map(s=>s.retrieval?.catalogRequest).filter(Boolean);
    const relevant=(io.publicCatalogs||[]).filter(p=>state.contract.catalogRequests.some(r=>r.platform===p.platform)&&(!(p.input==='location')||!observedCatalogs.some(r=>r.platform===p.platform)));
    const used=new Set((observedCatalogs.length?observedCatalogs:sources.some(s=>s.observedLinks?.length)?state.contract.catalogRequests||[]:[]).map(catalogRequestKey));
    let validationFeedback=null;
    for(let attempt=0;relevant.length&&attempt<2&&calls.rewrite<4;attempt++)try{
      calls.rewrite++;const one=relevant.length===1?relevant[0]:null,input=one?.input||'keywords';
      const observedBrands=[...new Set(sources.flatMap(s=>s.merchantObservation?.attributes?.filter(a=>/^(?:品牌|brand)$/i.test(a.label)&&s.text.includes(a.quote)).map(a=>a.value)||[]))];
      const answer=await io.model([{role:'system',content:'Choose ONE alternative public catalog request. 这个平台已确认适用，但当前仍没有足够不同配置。'+(one?'平台固定为'+one.platform+'，只返回JSON '+JSON.stringify({[input]:input==='location'?'用户城市名':'新的短搜索词'})+'。':'只返回JSON {catalogRequests:[一个请求]}。请求格式：'+JSON.stringify(relevant.map(p=>({platform:p.platform,[p.input||'keywords']:'短搜索词'})))+'。')+'请缩短查询：核心品类与规格值用空格分隔，省去参数名称和赘余修饰。至少要求是下限，可以探查更高规格，但不修改用户阈值；hypotheticalLimits只作为待验证的检索假设，不能当成商品事实。可以用observedBrands中真实出现的品牌探查其他配置，不预置新品牌、不猜型号。最多20字符，严禁把重量数值或金额写进keywords，这些条件已另外保存。租房城市必须保持原城市。不要照抄已有查询，不返回URL、候选或空数组。'+(attempt?'上次请求为空、重复或包含重量/金额；请移除这些数值，给一个非空短搜索词，只返回规定JSON。':'')},
        {role:'user',content:JSON.stringify({question:state.previous?.question||state.question,previousRequests:state.contract.catalogRequests,observedCatalogRequests:observedCatalogs,unavailableKeywords:observedCatalogs.map(r=>r.keywords).filter(Boolean),knownChoices:progress().observedAlternatives,observedBrands,excludedReasons:progress().excludedReasons,hypotheticalLimits:(state.contract.whatifs||[]).map(w=>w.settings?.limits),validationFeedback})}]);
      const proposals=Array.isArray(answer.catalogRequests)?answer.catalogRequests:one?[{platform:one.platform,[input]:answer[input]}]:[];
      const next=normalizeCatalogRequests(proposals,relevant).filter(r=>validCatalogRequest(r)&&!used.has(catalogRequestKey(r))).slice(0,1);
      if(!next.length){validationFeedback={rejectedRequests:proposals,reason:'Empty, invalid, or already observed. Return a DIFFERENT short query. A minimum specification permits higher configurations; do not add weight or price to keywords.'};throw new Error('No valid catalog choice');}return next;
    }catch{if(attempt)trace.push(event('recover','暂未选出新的有效目录，继续利用已有的公开来源。'));}
    return [];
  }
  if(!catalogRequests.length)catalogRequests=await chooseCatalog();

  for(const [index,request]of catalogRequests.entries()){
    if(enough()||calls.search+calls.catalog>=2||typeof io.searchCatalog!=='function')break;
    calls.catalog++;trace.push(event('recover','根据刚才的取舍，补查公开目录：'+(request.keywords||request.location)));
    try{const page=await io.searchCatalog(catalogRequestForConditions(request,state.contract,io.publicCatalogs));if(!page?.url||!page.text||sources.some(s=>s.url===page.url))continue;
      const source={id:'source-'+randomUUID().slice(0,12),url:page.url,title:page.title||'补查目录',text:page.text.slice(0,30000),kind:'page',retrievedAt:page.observedAt||new Date().toISOString(),retrieval:{catalogRequest:request}};
      attachRentalPage(source,page);attachMerchantPage(source,page);sources.unshift(source);attemptedUrls.add(source.url);
      const selected=await selectLinks(observed([source]),6,'Choose up to 6 concrete detail URLs from these OBSERVED catalog rows to VERIFY likely same-type alternatives against the supplied conditions and recorded exclusion reasons. Return JSON {urls:[]}. No invented URLs.',{exploreUnknown:true});
      await readDetailUrls(selected);
    }catch{}
    if(!enough()&&index===catalogRequests.length-1&&calls.search+calls.catalog<2&&calls.rewrite<4&&calls.read<14)catalogRequests.push(...await chooseCatalog());
  }

  for(const query of queries){
    if(enough()||calls.search+calls.catalog>=2)break;
    trace.push(event('recover','补充查找：'+query));calls.search++;
    const fresh=[];
    try{
      const rows=await io.search(query);
      for(const row of (Array.isArray(rows)?rows:[]).slice(0,4)){
        const record=collectedSource(row,query);if(!record||sources.some(source=>source.url===record.url))continue;
        const source={id:'source-'+randomUUID().slice(0,12),...record};sources.push(source);fresh.push(source);attemptedUrls.add(source.url);
      }
    }catch{continue;}
    const ranked=prioritizeSources(fresh,state.contract.schema,4);
    for(let offset=0;offset<ranked.length&&!enough();offset+=2){
      const batch=ranked.slice(offset,offset+2);
      for(const source of batch)if(typeof io.fetchSource==='function'&&searchPageReads<4&&calls.read<14){
        searchPageReads++;calls.read++;
        try{const page=await io.fetchSource(source.url),text=typeof page==='string'?page:page?.text||page?.raw_content;
          if(text){source.text=text.slice(0,30000);source.kind='page';attachRentalPage(source,page);attachMerchantPage(source,page);attemptedUrls.add(source.url);}}catch{}
      }
      await extractRecords(batch);
    }
    if(enough())break;
    const more=observed(fresh);
    const urls=await selectLinks(more,4,'Choose up to 4 concrete detail URLs from these OBSERVED listing rows only, preferring rows within the supplied conditions. Return JSON {urls:[]}. No navigation, login pages or invented links.');
    await readDetailUrls(urls);
  }
  if(!enough())trace.push(event('recover','这轮补查仍未取得足够依据，保留原问题和可追溯资料，不生成猜测结果。'));
  return finish();
}
