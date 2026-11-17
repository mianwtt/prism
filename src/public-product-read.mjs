import {suningMobileUrl} from './merchant-browser.mjs';
import {observationIssue} from './decision-evidence.mjs';
// Optional public-page adapter. It collects a source observation, never chooses an option or checks stock.
export function publicPriceKey(source,schema,io){return typeof io.readMerchantOffer==='function'&&schema.fields.some(f=>/^(?:元|CNY|人民币)$/i.test(f.unit))?suningMobileUrl(source.url):null;}
export async function appendPublicPrice(source,schema,io){
  if(!publicPriceKey(source,schema,io))return false;
  const offer=await io.readMerchantOffer(source.url);
  if(offer?.status!=='observed'||!offer.snapshot?.text||suningMobileUrl(offer.snapshot.url)!==suningMobileUrl(source.url))return false;
  const quoted=String(offer.quote||'');
  const field={label:'页面标价',unit:'元',type:'number'};
  if(observationIssue(field,{value:offer.value,quote:quoted},{text:offer.snapshot.text,title:offer.configuration}))return false;
  source.text=source.text+'\n\n--- 公开商品页标价快照 ---\n'+String(offer.snapshot.text).slice(0,12000);
  source.retrieval={...source.retrieval,priceObservedAt:offer.retrievedAt,priceSourceUrl:offer.snapshot.url};
  source.pageIdentity={name:offer.configuration};
  source.publicPrice={value:offer.value,quote:quoted,currency:'CNY',observedAt:offer.retrievedAt};
  source.kind='page';return true;
}
