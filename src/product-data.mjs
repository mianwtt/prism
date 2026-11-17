import {configurationIssue} from './configuration.mjs';
import {suningMobileUrl} from './merchant-browser.mjs';
const unitNumber=(text,pattern)=>{const match=pattern.exec(text);return match?{value:Number(match[1]),quote:match[0]}:null;};
export function normalizeMerchantProduct(raw){
 const offer=raw.offer||{},spec=String(raw.specificationText||''),title=offer.configuration||offer.snapshot?.title||'';
 const id=raw.key||new URL(raw.url).pathname;
 const blockers=[];
 const sourceId=id+'-spec',priceSourceId=id+'-price';
 const sources=[{id:sourceId,url:raw.specificationUrl||raw.url,title,text:spec,retrievedAt:raw.retrievedAt,kind:'page'},
 {id:priceSourceId,url:offer.snapshot?.url||raw.url,title,text:offer.snapshot?.text||'',retrievedAt:offer.retrievedAt,kind:'page'}];
 const specTitle=raw.specificationTitle||spec.split('\n').find(s=>s.startsWith('# '))?.slice(2)||'';
 const mismatch=configurationIssue(title,specTitle);
 if(mismatch)blockers.push(mismatch);
 const memory=unitNumber(spec,/内存容量\s*[:：]?\s*(\d+(?:\.\d+)?)\s*GB\b/i);
 const weight=unitNumber(spec,/净重\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:千克|kg|公斤)/i);
 const storage=/硬盘容量\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(TB|GB)\b/i.exec(spec);
 const line=label=>new RegExp(`(?:^|[\\n|\\t])\\s*[-*]?\\s*${label}\\s*[:：]?\\s*([^|\\n\\t]+)`).exec(spec);
 const cpu=line('CPU型号'),os=line('操作系统'),screen=line('屏幕分辨率');
 const observed=offer.status==='observed'&&Number.isFinite(offer.value)&&offer.value>0&&offer.quote&&sources[1].text.includes(offer.quote);
 const field=(value,quote,source=sourceId)=>({value,quote,sourceId:source,status:'source-backed'});
 const fields={};
 if(observed)fields.priceCNY=field(offer.value,offer.quote,priceSourceId);
 if(memory)fields.memoryGB=field(memory.value,memory.quote);
 if(weight)fields.weightKg=field(weight.value,weight.quote);
 if(storage)fields.storageGB=field(Number(storage[1])*(storage[2].toUpperCase()==='TB'?1024:1),storage[0]);
 if(cpu)fields.cpu=field(cpu[1].trim(),cpu[0]);
 if(os)fields.os=field(os[1].trim(),os[0]);
 if(screen)fields.screenResolution=field(screen[1].replaceAll('\\','').trim(),screen[0]);
 const required=['priceCNY','cpu','memoryGB','storageGB','weightKg','os','screenResolution'];
 for(const key of required)if(!fields[key])blockers.push('missing:'+key);
 const attributes={};
 for(const label of ['系列','型号','内存类型','内存频率','屏幕尺寸','屏幕类型','屏幕比例','色域','电池','电源适配器','颜色','机身尺寸','无线局域网','蓝牙功能','厂商保修政策','CCC认证编号']){
  const match=line(label);if(match)attributes[label]=field(match[1].trim(),match[0]);
 }
 const tableModelIssue=configurationIssue(title,attributes['型号']?.value);
 if(tableModelIssue&&!blockers.includes(tableModelIssue))blockers.push(tableModelIssue);
 const runtime=unitNumber(spec,/(?:续航时间|视频播放)\s*(\d+(?:\.\d+)?)\s*小时/);
 const runtimeHours=runtime?field(runtime.value,runtime.quote):{status:'not-reported-in-captured-source',sourceId,reason:'保存的规格正文未披露小时数；未换算电池容量'};
 return {id,name:title.trim(),sourceProductUrl:raw.url,identity:{platformProductId:raw.url?new URL(raw.url).pathname.split('/').at(-1)?.replace('.html',''):null,manufacturerPartNumber:/\b(\d{2}-bu\d{4}tu)\b/i.exec(title)?.[1]||null,configurationTitle:title.trim()},
  status:blockers.length?'research-draft':'comparison-ready',requiredFields:required,fields,attributes,runtimeHours,images:(raw.images||[]).filter(i=>/^https:\/\//.test(i.url||'')),
  price:{type:'merchant-page-listed',currency:'CNY',availability:offer.availability||'not-recorded',region:offer.region||null,conditions:offer.conditions||[],stockIsBlocking:false},
  blockers,sources};
}
export function partitionProductData(records){
 const products=records.map(normalizeMerchantProduct);
 return {comparisonReady:products.filter(p=>p.status==='comparison-ready'),researchDrafts:products.filter(p=>p.status!=='comparison-ready')};
}
export function buildComparisonData(candidates,sources){
 const records=candidates.map(c=>{
  const offer=(c.priceObservations||[]).find(p=>p.kind==='merchant-listed');
  const source=sources.find(s=>s.id===offer?.sourceId);
  const url=source?.url||'';
  const productUrl=suningMobileUrl(url);
  const spec=productUrl?sources.filter(s=>suningMobileUrl(s.url)===productUrl&&/内存容量/.test(s.text||'')).sort((a,b)=>b.text.length-a.text.length)[0]:null;
  return {key:c.id,url:url||null,retrievedAt:source?.retrievedAt,images:c.media?.url?[c.media]:[],specificationTitle:spec?.title,specificationText:spec?.text||'',offer:offer?{...offer,configuration:offer.configuration||c.proposedName||c.name,snapshot:{title:source?.title,url,text:source?.text||''}}:{configuration:c.proposedName||c.name}};
 });
 return partitionProductData(records);
}
