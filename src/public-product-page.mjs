import {request} from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {merchantRawCandidate} from './public-merchant-read.mjs';
import {parseRetailProductPage} from './retail-page.mjs';
import {productConfiguration} from './product-offers.mjs';

export function publicAddress(address){
  if(isIP(address)===4){const [a,b]=address.split('.').map(Number);return ![0,10,127].includes(a)&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&[0,168].includes(b))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&[18,19].includes(b));}
  return isIP(address)===6&&/^2[0-9a-f]{3}:/i.test(address)&&!/^2001:(?:db8|0:)/i.test(address);
}
export async function assertPublicPage(raw,{lookupFn=lookup}={}){
  const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/\.(?:local|internal|test|invalid)$/.test(u.hostname))throw new Error('详情读取仅支持公开 HTTPS 页面');
  const addresses=await lookupFn(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('详情地址不是公开网络');
  return {url:u.href,address:addresses.find(a=>a.family===4)||addresses[0]};
}
export const pinnedLookup=address=>(_host,options,done)=>options?.all?done(null,[address]):done(null,address.address,address.family);
export async function readPublicHtml(raw,{remaining=3}={}){
  const {url,address}=await assertPublicPage(raw);
  return new Promise((resolve,reject)=>{
    const req=request(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PrismResearch/0.4; public product reader)','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'gzip, deflate, br'},lookup:pinnedLookup(address)},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(!remaining||!res.headers.location)return reject(new Error('详情页重定向过多'));readPublicHtml(new URL(res.headers.location,url).href,{remaining:remaining-1}).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();return reject(new Error('详情页 HTTP '+res.statusCode));}
      if(!/html|json/i.test(res.headers['content-type']||'')){res.resume();return reject(new Error('详情返回的不是网页'));}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>3_000_000){res.destroy();reject(new Error('详情页过大'));}else chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>{try{let data=Buffer.concat(chunks);const options={maxOutputLength:5_000_000};if(res.headers['content-encoding']==='gzip')data=gunzipSync(data,options);if(res.headers['content-encoding']==='deflate')data=inflateSync(data,options);if(res.headers['content-encoding']==='br')data=brotliDecompressSync(data,options);const charset=/charset\s*=\s*["']?([^\s;"']+)/i.exec(res.headers['content-type']||'')?.[1]||'utf-8';resolve({url,html:new TextDecoder(charset).decode(data)});}catch(e){reject(e);}});
    });req.on('error',reject);req.setTimeout(15000,()=>req.destroy(new Error('详情读取超时')));req.end();
  });
}
const decode=value=>String(value||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[\da-f]+|\d+);/gi,s=>{const common={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(common[s.toLowerCase()])return common[s.toLowerCase()];const n=s[2].toLowerCase()==='x'?parseInt(s.slice(3),16):parseInt(s.slice(2),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';});
const type=(object,name)=>[object?.['@type']].flat().some(t=>String(t).split('/').at(-1)===name);
const array=value=>value===undefined?[]:Array.isArray(value)?value:[value];
const plain=value=>typeof value==='string'||typeof value==='number'?String(value):value?.name||'';
export const publicPageText=html=>decode(String(html).replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]+>/g,'\n')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,25000);
function nodes(value,out=[]){if(Array.isArray(value))for(const item of value)nodes(item,out);else if(value&&typeof value==='object'){out.push(value);if(value['@graph'])nodes(value['@graph'],out);if(value.mainEntity)nodes(value.mainEntity,out);}return out;}
export function parseProductPage(html,url,{now=new Date().toISOString()}={}){
  const documents=[];
  for(const m of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi))try{documents.push(...nodes(JSON.parse(m[1].trim())));}catch{}
  // ProductGroup describes several variants; do not borrow its lowPrice as a SKU price.
  const products=documents.filter(o=>type(o,'Product'));
  if(products.length!==1)return parseRetailProductPage(html,url,{now});
  const p=products[0],name=plain(p.name).trim();if(!name)return null;
  const attributes=array(p.additionalProperty).filter(a=>a?.name&&a.value!==undefined).map(a=>({label:plain(a.name),value:plain(a.value)+(a.unitText||''),quote:plain(a.name)+'：'+plain(a.value)+(a.unitText||'')}));
  if(p.color)attributes.push({label:'颜色',value:plain(p.color),quote:'颜色：'+plain(p.color)});
  if(p.size)attributes.push({label:'尺寸',value:plain(p.size),quote:'尺寸：'+plain(p.size)});
  const identity=[p.brand?'品牌：'+plain(p.brand):'',p.mpn?'MPN：'+plain(p.mpn):'',p.model?'型号：'+plain(p.model):'',p.gtin||p.gtin13||p.gtin14||p.gtin12||p.gtin8?'GTIN：'+(p.gtin||p.gtin13||p.gtin14||p.gtin12||p.gtin8):''].filter(Boolean);
  const lines=[],offers=[];
  for(const o of array(p.offers).slice(0,12)){
    if(type(o,'AggregateOffer')||o.lowPrice!==undefined||o.highPrice!==undefined)continue;
    const price=Number(o.price),currency=String(o.priceCurrency||'').toUpperCase();if(!Number.isFinite(price)||price<=0||!currency)continue;
    const seller=plain(o.seller)||new URL(url).hostname,conditions=[o.description,o.priceSpecification?.membershipPointsEarned,o.eligibleCustomerType?'适用客户：'+plain(o.eligibleCustomerType):'',o.priceSpecification?.validForMemberTier?'会员专属':''].filter(Boolean).join(' ');
    const quote='原页结构化报价：'+currency+' '+price+'；商家：'+seller+(conditions?'；条件：'+conditions:'');
    const availability=/OutOfStock|SoldOut|Discontinued/i.test(o.availability||'')?'out-of-stock':/InStock|LimitedAvailability/i.test(o.availability||'')?'in-stock':/PreOrder|PreSale/i.test(o.availability||'')?'preorder':'unknown';
    const shippingData=array(o.shippingDetails)[0]?.shippingRate,shipping=shippingData?.currency===currency&&Number.isFinite(Number(shippingData?.value))?Number(shippingData.value):null;
    const shippingQuote=shipping===null?'':'原页结构化运费：'+currency+' '+shipping;
    lines.push(quote,...(shippingQuote?[shippingQuote]:[]));
    offers.push({price,currency,seller,quote,basis:/coupon|trade.in|member|券|补贴|会员/i.test(conditions)?'conditional':'public',conditions,availability,shipping,shippingQuote,validUntil:o.priceValidUntil||null,raw:JSON.stringify(o).slice(0,5000)});
  }
  const body=publicPageText(html).slice(0,16000);
  const text=[name,...identity,...attributes.map(a=>a.quote),...lines,'[页面正文]',body].join('\n');
  const image=plain(array(p.image)[0]?.url||array(p.image)[0]);let imageUrl=null;try{const u=new URL(image,url);if(u.protocol==='https:')imageUrl=u.href;}catch{}
  return {url,title:name,text,observedAt:now,productObservation:{name,brand:plain(p.brand),model:plain(p.mpn)||plain(p.model),gtin:plain(p.gtin||p.gtin13||p.gtin14||p.gtin12||p.gtin8),attributes,offers,image:imageUrl,provenance:'原页 JSON-LD Product 与 Offer；非模型生成'}};
}
export function attachProductPage(source,page){
  if(!page?.productObservation||page.url!==source.url)return false;
  source.productObservation=structuredClone(page.productObservation);source.pageIdentity={name:page.productObservation.name};source.retrieval={...source.retrieval,method:page.reader||'public-product-jsonld'};return true;
}
export function structuredProductCandidate(source,schema){
  const p=source.productObservation;if(!p)return null;
  const offer=p.offers.find(o=>o.currency==='CNY'&&o.basis==='public');
  const result=merchantRawCandidate({...source,merchantObservation:{name:p.name,attributes:p.attributes,offer:offer?{value:offer.price,quote:offer.quote}:null}},schema);
  const configuration=productConfiguration(p.attributes),bundle=p.attributes?.find(a=>/^(套餐|套件|包装内容)$/.test(a.label));
  if(p.category==='single-board-computer'&&configuration?.bundle==='board-only'&&bundle)for(const f of schema.fields){
    if(f.type==='boolean'&&/套装|套件|套餐/.test([f.label,...(f.aliases||[])].join(' '))&&!/单板|裸板|仅主板/.test(f.label))result.facts[f.key]={value:false,quote:bundle.quote,sourceId:source.id};
  }
  return result;
}
export async function readStructuredProductPage(url){const page=await readPublicHtml(url);return parseProductPage(page.html,page.url);}
export async function readReadablePublicPage(url){const page=await readPublicHtml(url),structured=parseProductPage(page.html,page.url);if(structured)return structured;const text=publicPageText(page.html);if(text.length<50)throw new Error('公开页正文不足');return {url:page.url,title:decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1]||page.url).trim(),text,observedAt:new Date().toISOString()};}
