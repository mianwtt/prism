import {attachRentalPage,bindRentalImages} from './public-rental-read.mjs';
import {attachMerchantPage,bindMerchantImages} from './public-merchant-read.mjs';
import {observationIssue} from './decision-evidence.mjs';
import {attachProductPage} from './public-product-page.mjs';
import {offerComparison} from './product-offers.mjs';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
// Recheck the quoted pages. This operation does not invent updated values or run a new search.
export async function refreshGeneralEvidence(previous,io,onProgress=()=>{},{snapshot=null,onCheckpoint=()=>{}}={}){
  if(typeof io.fetchSource!=='function')throw new Error('当前服务不支持读取原始页面，请先配置网页读取服务');
  const state=snapshot||{result:structuredClone(previous),done:[],withdrawn:0,imagesUpdated:0,imagesWithdrawn:0};
  const result=state.result;
  const emit=(node,message)=>{const event={node,type:node==='complete'?'complete':'thinking',message,at:new Date().toISOString()};result.trace??=[];result.trace.push(event);onProgress(event);};
  const linkedIds=new Set(result.candidates.flatMap(c=>[...(c.commerce?.matchedSourceIds||[]),...Object.values(c.facts).flatMap(f=>[f.sourceId,...(f.evidence||[]).map(o=>o.sourceId),...(f.conflictingEvidence||[]).map(o=>o.sourceId)])].filter(Boolean)));
  state.sourceIds??=result.sources.filter(s=>linkedIds.has(s.id)&&s.url).sort((a,b)=>(a.lastCheckedAt||'').localeCompare(b.lastCheckedAt||'')).slice(0,12).map(s=>s.id);
  const sources=state.sourceIds.map(id=>result.sources.find(s=>s.id===id)).filter(Boolean);
  for(const source of sources){
    if(state.done.includes(source.id))continue;
    emit('read','正在重新核对引用：'+source.title.slice(0,100));
    const at=new Date().toISOString();
    const photoCandidates=result.candidates.filter(c=>['listing-photo','product-photo'].includes(c.media?.kind)&&c.media.sourceId===source.id),oldPhotos=new Map(photoCandidates.map(c=>[c.id,c.media.url]));
    let freshRental=false,freshMerchant=false,freshProduct=false;
    try{
      const response=await io.fetchSource(source.url),text=typeof response==='string'?response:response?.text||response?.raw_content;
      if(typeof text!=='string'||!text.trim())throw new Error('Empty page');
      source.previousRetrievedAt=source.retrievedAt;source.text=text.slice(0,30000);source.kind='page';source.retrievedAt=at;source.lastCheckedAt=at;source.refreshStatus='verified';
      freshRental=Boolean(attachRentalPage(source,response));
      freshMerchant=Boolean(attachMerchantPage(source,response));
      freshProduct=Boolean(attachProductPage(source,response));
    }catch{source.lastCheckedAt=at;source.refreshStatus='failed';}
    if(!freshRental)delete source.rentalObservation;
    if(!freshMerchant){delete source.merchantObservation;delete source.publicPrice;}
    if(!freshProduct)delete source.productObservation;
    for(const c of photoCandidates)delete c.media;
    if(freshRental)bindRentalImages(result.candidates.filter(c=>c.sourceId===source.id),[source]);
    if(freshMerchant)bindMerchantImages(result.candidates.filter(c=>c.sourceId===source.id),[source]);
    for(const c of photoCandidates){if(!c.media)state.imagesWithdrawn=(state.imagesWithdrawn||0)+1;else if(c.media.url!==oldPhotos.get(c.id))state.imagesUpdated=(state.imagesUpdated||0)+1;}
    for(const c of result.candidates)for(const [key,f] of Object.entries(c.facts)){
      if(f.sourceId!==source.id||!['confirmed','cited'].includes(f.status))continue;
      if(source.refreshStatus==='failed'||!clean(source.text).includes(clean(f.quote))||observationIssue(result.schema.fields.find(field=>field.key===key),f,source)){
        const before=structuredClone(f);delete before.previousObservation;
        f.previousObservation=before;f.status='unknown';f.reviewReason=source.refreshStatus==='failed'?'这次未能读取原文，历史引用暂不参与比较':'最新原文未能支持已保存的引用，需要继续核对';
        delete f.confirmation;delete f.reviewedAt;delete f.reviewBefore;state.withdrawn++;
      }
    }
    state.done.push(source.id);await onCheckpoint(state);
  }
  delete result.analysis;
  for(const c of result.candidates)if(c.commerce){const comparison=offerComparison(c,result.sources,result.schema),selected=c.commerce.selectedOfferId;c.commerce=comparison?{...comparison,selectedOfferId:comparison.offers.some(o=>o.id===selected&&o.comparable)?selected:null}:{offers:[],matchedSourceIds:[],selectedOfferId:null,bestOfferId:null,sourceCount:0};}
  result.refreshReport={checked:state.done.length,unavailable:result.sources.filter(s=>state.done.includes(s.id)&&s.refreshStatus==='failed').length,withdrawn:state.withdrawn,imagesUpdated:state.imagesUpdated||0,imagesWithdrawn:state.imagesWithdrawn||0,remaining:Math.max(0,[...linkedIds].filter(id=>result.sources.find(s=>s.id===id)?.url).length-sources.length),at:new Date().toISOString(),kind:'citation-recheck'};
  emit('complete',`已核对 ${state.done.length} 份引用来源，${state.withdrawn} 项历史引用本次未能验证；原版本保留。`);
  return result;
}
