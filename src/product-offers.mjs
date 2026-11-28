import {observationIssue,sourceSite} from './decision-evidence.mjs';

const clean=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s™®]/g,'').trim();
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export const offerPriceField=schema=>schema.fields.find(f=>/^(元|CNY|人民币)$/i.test(f.unit)&&/价格|售价|标价|报价|price|cost/i.test([f.label,...(f.aliases||[])].join(' ')));
export function offerPriceCurrent(candidate,field,{now=Date.now()}={}){
  if(!candidate.commerce||!offerPriceField({fields:[field]}))return true;
  const offer=candidate.commerce.offers?.find(o=>o.id===candidate.commerce.selectedOfferId),fact=candidate.facts[field.key];
  return Boolean(offer?.comparable&&offer.sourceId===fact?.sourceId&&offer.price===fact?.value&&offer.quote===fact?.quote&&Number.isFinite(Date.parse(offer.retrievedAt))&&now-Date.parse(offer.retrievedAt)<=24*3600_000&&(!offer.validUntil||!Number.isFinite(Date.parse(offer.validUntil))||Date.parse(offer.validUntil)>=now));
}
const variantLabels={memory:/^(?:内存|内存容量|运行内存|ram|memory)$/i,storage:/^(?:硬盘|硬盘容量|存储|存储容量|ssd|storage)$/i,cpu:/^(?:cpu|cpu型号|处理器|处理器型号)$/i,color:/^(?:颜色|配色|color|colour)$/i,size:/^(?:尺寸|屏幕尺寸|size|screensize)$/i,edition:/^(?:版本|edition|version)$/i,bundle:/^(?:套餐|套件|包装内容|bundle)$/i};
export function canonicalGtin(value){const text=String(value||'');if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(text))return null;const digits=[...text].map(Number),check=digits.pop(),sum=digits.reverse().reduce((n,v,i)=>n+v*(i%2?1:3),0);return (10-sum%10)%10===check?text.padStart(14,'0'):null;}
export function productConfiguration(attributes=[]){
  const result={};
  for(const a of attributes){const label=String(a.label||'').replace(/[\s()（）]/g,'');const key=Object.keys(variantLabels).find(k=>variantLabels[k].test(label));if(!key||!a.value)continue;
    let value=clean(a.value).replace(/千兆字节/g,'gb');
    if(key==='bundle'&&(/^(?:单独主机无套餐|裸板|单主板|仅主板)$/.test(value)||/^raspberrypi树莓派\d+开发板[-（(]?\d+gb[）)]?[×x]1$/.test(value)))value='board-only';
    if(result[key]&&result[key]!==value)return null;result[key]=value;
  }
  return result;
}
// A retailer's SKU is local to that seller. Only an explicit GTIN, or a brand +
// manufacturer model + fully observed configuration, can join different pages.
export function productDescriptor(source){
  let p=source?.productObservation;
  if(!p&&source?.merchantObservation){
    const o=source.merchantObservation,find=regex=>o.attributes?.find(a=>regex.test(a.label))?.value;
    p={name:o.name,brand:find(/^(品牌|brand)$/i),model:find(/^(型号|产品型号|完整型号|mpn|model)$/i),attributes:o.attributes,offers:o.offer?[{...o.offer,price:o.offer.value,currency:'CNY',basis:'public',conditions:'',notes:Array.isArray(o.offer.conditions)?o.offer.conditions.join('；'):'',availability:o.offer.availability||'unknown',seller:o.offer.seller||sourceSite(source.url)}]:[]};
  }
  if(!p?.name||!source?.text||!source.url||source.kind!=='page'||source.refreshStatus==='failed')return null;
  const compact=clean(source.text);if(!compact.includes(clean(p.name)))return null;
  const attributes=(p.attributes||[]).filter(a=>a.quote&&compact.includes(clean(a.quote))&&clean(a.quote).includes(clean(a.value)));
  const configuration=productConfiguration(attributes);if(!configuration)return null;
  const brand=clean(p.brand),rawModel=clean(p.model),gtin=canonicalGtin(p.gtin);
  const model=p.category==='single-board-computer'&&/^raspberrypi\d+(?:model[a-z])?(?:-?\d+gb)?$/.test(rawModel)?rawModel.replace(/-?\d+gb$/,''):rawModel;
  if(brand&&!compact.includes(brand)||rawModel&&!compact.includes(rawModel)||gtin&&!compact.includes(String(p.gtin)))return null;
  const enough=Object.keys(configuration).length>=2&&(!/电脑|笔记本|laptop|notebook/i.test(p.name)||['memory','storage','cpu'].every(k=>configuration[k]));
  const identity=gtin?'gtin:'+gtin:brand&&model&&model.length>=4&&/\d/.test(model)&&enough?'model:'+brand+':'+model+':'+JSON.stringify(Object.entries(configuration).sort()):null;
  return {...p,brand,model,modelLabel:p.model,gtin,configuration,identity,attributes};
}
export function sameProduct(a,b){
  if(!a?.identity||!b?.identity||a.identity!==b.identity)return false;
  return Object.keys(a.configuration).every(k=>!b.configuration[k]||a.configuration[k]===b.configuration[k])&&Object.keys(b.configuration).every(k=>!a.configuration[k]||b.configuration[k]===a.configuration[k]);
}
export function checkedOffers(source,schema,{now=Date.now()}={}){
  const product=productDescriptor(source),field=offerPriceField(schema);if(!product||!field)return [];
  const observed=Date.parse(source.retrievedAt),stale=!Number.isFinite(observed)||now-observed>24*3600_000;
  return (product.offers||[]).slice(0,12).flatMap((o,i)=>{
    const price=Number(o.price??o.value),quote=String(o.quote||''),currency=String(o.currency||'').toUpperCase();
    if(!Number.isFinite(price)||price<=0||!quote||!clean(source.text).includes(clean(quote)))return [];
    const basis=o.basis==='public'&&!/券后|补贴|会员|以旧换新|起价|起售|参考价|\bfrom\b|coupon|trade.in|member/i.test(quote+' '+(o.conditions||''))?'public':'conditional';
    // Conditional prices remain visible, but never become the ordinary comparison price.
    const publicIssue=basis==='public'?observationIssue(field,{value:price,quote},source):null;
    const availability=['in-stock','out-of-stock','preorder'].includes(o.availability)?o.availability:'unknown';
    const expired=o.validUntil&&Number.isFinite(Date.parse(o.validUntil))&&Date.parse(o.validUntil)<now;
    const shipping=Number.isFinite(o.shipping)&&o.shipping>=0&&o.shippingQuote&&clean(source.text).includes(clean(o.shippingQuote))?o.shipping:null;
    const reasons=[currency!=='CNY'?'币种不同':null,basis!=='public'?'有条件报价':null,availability==='out-of-stock'?'页面标注缺货':null,availability==='preorder'?'预售报价':null,stale?'采集超过24小时':null,expired?'报价已到期':null,publicIssue].filter(Boolean);
    return [{id:source.id+'-offer-'+i,sourceId:source.id,url:safeUrl(source.url),seller:String(o.seller||sourceSite(source.url)).slice(0,160),price,currency,quote,basis,availability,conditions:String(o.conditions||'').slice(0,300),shipping,total:shipping===null?price:Math.round((price+shipping)*100)/100,shippingQuote:o.shippingQuote||'',retrievedAt:source.retrievedAt,validUntil:o.validUntil||null,comparable:!reasons.length,reasons}];
  });
}
export function offerComparison(candidate,sources,schema,{now=Date.now()}={}){
  const anchor=sources.find(s=>s.id===candidate.sourceId),descriptor=productDescriptor(anchor);if(!descriptor)return null;
  const matched=sources.filter(s=>s.id===anchor.id||sameProduct(descriptor,productDescriptor(s))),offers=matched.flatMap(s=>checkedOffers(s,schema,{now}));
  const seen=new Set(),unique=offers.filter(o=>{const key=[o.url,o.seller,o.price,o.basis].join('|');if(seen.has(key))return false;seen.add(key);return true;});
  const priceFact=candidate.facts[offerPriceField(schema)?.key],held=/独立审查|暂缓采用/.test(priceFact?.reviewReason||'')?(priceFact.rejectedEvidence?.sourceId||candidate.sourceId):null;
  for(const o of unique)if(o.sourceId===held||candidate.offerHolds?.includes(o.sourceId)){o.comparable=false;o.reasons.push('独立审查暂缓采用');}
  const comparable=unique.filter(o=>o.comparable),knownShipping=comparable.length>0&&comparable.every(o=>o.shipping!==null);
  comparable.sort((a,b)=>(knownShipping?a.total-b.total:a.price-b.price)||Number(b.availability==='in-stock')-Number(a.availability==='in-stock')||b.retrievedAt.localeCompare(a.retrievedAt));
  return {identity:descriptor.identity,configuration:descriptor.configuration,matchedSourceIds:matched.map(s=>s.id),offers:unique,bestOfferId:comparable[0]?.id||null,priceBasis:knownShipping?'total':'listed',sourceCount:new Set(unique.map(o=>sourceSite(o.url))).size};
}
export function applyOffer(candidate,offer,comparison,schema){
  const field=offerPriceField(schema);if(!field||!offer?.comparable)throw new Error('该报价尚不能参与同款比价');
  const next=structuredClone(candidate);
  next.facts[field.key]={value:offer.price,status:'cited',sourceId:offer.sourceId,quote:offer.quote};
  next.commerce={...comparison,selectedOfferId:offer.id};
  next.sourceIds=[...new Set([...(candidate.sourceIds||[candidate.sourceId]),...comparison.matchedSourceIds])];
  return next;
}
export function attachOfferComparisons(candidates,sources,schema,options={}){
  const seen=new Set(),result=[];
  for(const c of candidates){
    const held=[...new Set([...(c.offerHolds||[]),...(options.heldSourceIds||[])])],input=held.length?{...c,offerHolds:held}:c;
    const comparison=offerComparison(input,sources,schema,options);
    // Unknown identity never collapses another seller's listing.
    const key=comparison?.identity?comparison.identity+JSON.stringify(comparison.configuration):null;if(key&&seen.has(key))continue;if(key)seen.add(key);
    const best=comparison?.offers.find(o=>o.id===comparison.bestOfferId);
    const next=best?applyOffer(input,best,comparison,schema):structuredClone(input);
    if(comparison&&!best){next.commerce={...comparison,selectedOfferId:null};const field=offerPriceField(schema);if(field)next.facts[field.key]={value:null,status:'unknown',sourceId:null,quote:'',reviewReason:'未取得当前同配置、无额外资格条件且未标注缺货的可比报价'};}
    result.push(next);
  }
  return result;
}
export function offerSelectionBranch(space,{candidateId,offerId,scenarioId}){
  const parent=space.scenarios.find(s=>s.id===scenarioId),candidate=space.candidates.find(c=>c.id===candidateId);
  if(!parent?.candidateIds.includes(candidateId)||!candidate||!offerComparison(candidate,space.sources,space.schema))throw new Error('请选择当前分支已有商品的报价');
  if(space.scenarios.length>=24||space.candidates.length>=200)throw new Error('请先整理已有分支');
  // Recompute from original pages, never trust an imported or client-supplied best flag.
  const comparison=offerComparison(candidate,space.sources,space.schema),offer=comparison?.offers.find(o=>o.id===offerId);
  if(!offer?.comparable)throw new Error('报价已失效、配置不匹配或存在未满足条件，请重新核对');
  const next=structuredClone(space),chosen=applyOffer(candidate,offer,comparison,space.schema);
  chosen.id='option-'+crypto.randomUUID();next.candidates.push(chosen);
  const branch={id:'scenario-'+crypto.randomUUID(),parentScenarioId:parent.id,name:'改用'+offer.seller+'报价',settings:structuredClone(parent.settings),candidateIds:parent.candidateIds.map(id=>id===candidate.id?chosen.id:id),offerChoice:{productId:candidate.id,offerId:offer.id,sourceId:offer.sourceId},previewCandidateId:chosen.id};
  next.scenarios.push(branch);next.activeScenarioId=branch.id;next.settings=structuredClone(branch.settings);
  next.canvasScenarioIds=[...new Set([...(next.canvasScenarioIds||[parent.id]),parent.id,branch.id])];delete next.analysis;
  return next;
}
