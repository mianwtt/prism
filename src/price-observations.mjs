import {configurationIssue} from './configuration.mjs';
import {suningMobileUrl} from './merchant-browser.mjs';
import {candidateSources} from './source-extraction.mjs';
const clean=s=>String(s||'').toLowerCase().replace(/[\s()（）·+/_-]/g,'');
export function priceObservations(candidate,sources){
 const name=candidate.proposedName||candidate.originalName||candidate.name;
 const model=clean(name).match(/(?:matebook|vivobook|thinkbook|thinkpad|星book|无畏|蛟龙|macbook(?:air|pro)?)[a-z]*\d+/)?.[0];
 if(!model)return [];
 const out=[];
 for(const source of sources){
  let url;try{url=new URL(source.url);}catch{continue;}
  if(!['detail.zol.com.cn','wap.zol.com.cn'].includes(url.hostname)||source.kind!=='page'||!clean(source.title).includes(model)||configurationIssue(name,source.title))continue;
  const text=String(source.text||'');
  const push=(value,quote,configuration=source.title)=>{
   if(!Number.isFinite(value)||value<1000||value>100000||!text.includes(quote)||configurationIssue(name,configuration))return;
   if(out.some(p=>p.sourceId===source.id&&p.value===value&&p.configuration===configuration))return;
   out.push({value,currency:'CNY',kind:'aggregator-reference',sourceId:source.id,quote,configuration,retrievedAt:source.retrievedAt,label:'平台参考报价',availability:'未核实库存与成交价'});
  };
  const field=/\|\s*电商报价\s*\|\s*\[?[¥￥]\s*([\d,]+(?:\.\d+)?)/.exec(text);
  if(field)push(Number(field[1].replaceAll(',','')),field[0]);
  const id=/\/(\d{6,})\/(?:extraprice_\d+|price|index|param)\./.exec(url.pathname)?.[1];
  if(id){for(const m of text.matchAll(/\[(参考价[¥￥]\s*([\d,]+(?:\.\d+)?))\]\((https?:\/\/[^)]+)\)/g)){
    if(m[3].includes('/'+id+'/price.'))push(Number(m[2].replaceAll(',','')),m[0]);
  }}
  for(const line of text.split('\n')){
   if(!/\d+\s*(?:GB|G)\s*[/+]\s*\d+\s*(?:GB|G|TB)/i.test(source.title))continue;
   const row=/^\|\s*([^|]+)\|\s*[¥￥]\s*([\d,]+(?:\.\d+)?)/.exec(line);
   if(!row||!clean(row[1]).includes(model))continue;
   // Table rows identify their own variant; avoid taking a neighbouring SKU.
   if(configurationIssue(name,row[1]))continue;
   const variants=['标准版','柔光版','圆键盘','方键盘'];
   if(variants.some(v=>source.title.includes(v)&&!row[1].includes(v)))continue;
   push(Number(row[2].replaceAll(',','')),line,row[1].trim());
  }
 }
 return out.slice(0,8);
}
export async function enrichCandidatePrices(candidates,sources,io,progress=()=>{}){
 let reads=0,merchantReads=0;
 for(const candidate of candidates.slice(0,3)){
  candidate.priceObservations=priceObservations(candidate,sources);
  const name=candidate.proposedName||candidate.originalName||candidate.name;
  const model=clean(name).match(/(?:matebook|vivobook|thinkbook|thinkpad|星book|无畏)[a-z]*\d+/)?.[0];
  const merchant=candidateSources({...candidate,name},sources).find(s=>!configurationIssue(name,s.title)&&suningMobileUrl(s.url));
  if(merchant&&typeof io.readMerchantOffer==='function'){
   progress(`读取商家动态标价与库存：${candidate.name}`);merchantReads++;
   try{const observation=await io.readMerchantOffer(merchant.url);
    if(observation.status==='observed'&&observation.snapshot?.text?.includes(observation.quote)&&!configurationIssue(name,observation.configuration)){
     const source={id:'merchant-price-'+sources.length,url:observation.snapshot.url,title:observation.snapshot.title,text:observation.snapshot.text,kind:'page',retrievedAt:observation.retrievedAt,retrieval:{platform:'苏宁',method:'public-browser'}};
     sources.push(source);
     const {snapshot,...offer}=observation;
     candidate.priceObservations.unshift({...offer,sourceId:source.id});
     const old=candidate.facts?.price;
     if(candidate.facts&&old?.status!=='confirmed'&&old?.confirmation!=='user-assumption'){
      candidate.facts.price={value:offer.value,currency:'CNY',sourceId:source.id,quote:offer.quote,status:'unreviewed',priceKind:'merchant-listed',availability:offer.availability,conditions:offer.conditions||[]};
     }
     progress(`${candidate.name}：商家标价 ¥${offer.value}，${offer.availability==='out-of-stock'?'所选地区无货':'库存与结算条件需核实'}`);
    }else progress(`${candidate.name}：商家报价读取未通过（${observation.reason||'型号或原文不匹配'}）`);
   }catch{progress(`${candidate.name}：商家动态报价读取失败`);}
  }
  if(candidate.priceObservations.length||typeof io.fetchSource!=='function')continue;
  const linked=sources.find(s=>model&&clean(s.title).includes(model)&&!configurationIssue(name,s.title)&&/^https:\/\/detail\.zol\.com\.cn\/\d+\/\d+\//.test(s.url));
  const parts=linked&&new URL(linked.url).pathname.match(/^\/(\d+)\/(\d+)\//);
  if(!parts)continue;
  const url=`https://wap.zol.com.cn/${parts[1]}/${parts[2]}/extraprice_9999.html`;
  progress(`补读报价页：${candidate.name}（平台参考，非商家成交价）`);reads++;
  try{const text=await io.fetchSource(url);if(!text?.trim())continue;
   let source=sources.find(s=>s.url===url);
   if(!source){source={id:'price-'+sources.length,url,title:linked.title,text,kind:'page',retrievedAt:new Date().toISOString()};sources.push(source);}
   candidate.priceObservations=priceObservations(candidate,sources);
  }catch{}
 }
 return {reads,merchantReads};
}
