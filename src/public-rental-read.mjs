import {request} from 'node:https';
import * as tls from 'node:tls';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {isMonthlyAmountField,convertQuantity} from './decision-evidence.mjs';

const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const value=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return value>0&&value<=0x10ffff?String.fromCodePoint(value):'';}).replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g,s=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '}[s]));
const text=html=>decode(String(html||'').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const attr=(tag,key)=>decode(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*["\']([^"\']*)["\']','i').exec(tag)?.[1]||'');
export const rentalCityIndexURL='https://m.fang.com/city/hotcity.jsp?burl=/zf';
export function parseRentalCities(html){
 const cities=[];
 for(const a of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))try{
  const name=text(a[2]),url=rentalCatalogUrl(new URL(attr(a[1],'href'),rentalCityIndexURL).href);
  if(name&&name.length<=20&&url&&/^https:\/\/m\.fang\.com\/zf\/[a-z]{2,12}\/$/.test(url)&&!cities.some(c=>c.name===name))cities.push({name,url});
 }catch{}
 return cities;
}
function divBlock(html,className){
 const opening=new RegExp('<div\\b[^>]*class=["\'][^"\']*\\b'+className+'\\b[^"\']*["\'][^>]*>','i').exec(html);if(!opening)return '';
 const tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=opening.index+opening[0].length;let depth=1,m;
 while((m=tags.exec(html))){depth+=/^<\//.test(m[0])?-1:1;if(!depth)return html.slice(opening.index,m.index+m[0].length);}
 return '';
}
export function rentalDetailUrl(raw){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const central=u.hostname==='zu.fang.com'&&/^\/[a-z]{2,12}\/chuzu\/3_\d+_\d\.htm$/.test(u.pathname);
  const regional=/^[a-z]{2,12}\.zu\.fang\.com$/.test(u.hostname)&&/^\/chuzu\/3_\d+_\d\.htm$/.test(u.pathname);
  const mobile=u.hostname==='m.fang.com'&&/^\/zf\/[a-z]{2,12}\/[13]_\d+\.html$/.test(u.pathname);
  return central||mobile?u.origin+u.pathname:regional?'https://zu.fang.com/'+u.hostname.split('.')[0]+u.pathname:null;
 }catch{return null;}
}
export function rentalCatalogUrl(raw){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(u.hostname==='zu.fang.com'&&/^\/[a-z]{2,12}\/(?:(?:house\/[a-zA-Z0-9_-]+\/?|houses\/zf_\d+[a-z]{2,12}\/))?$/.test(u.pathname))return u.origin+u.pathname;
  if(/^[a-z]{2,12}\.zu\.fang\.com$/.test(u.hostname)&&/^\/(?:house\/[a-zA-Z0-9_-]+\/?)?$/.test(u.pathname))return 'https://zu.fang.com/'+u.hostname.split('.')[0]+u.pathname;
  if(u.hostname==='m.fang.com'&&/^\/zf\/[a-z]{2,12}(?:_\d{1,8})?\/(?:(?:[a-z]\d{1,6}){1,8}\/)?$/.test(u.pathname))return u.origin+u.pathname;
  if(u.hostname==='www.fang.com'&&/^\/houses\/zf_\d+[a-z]{2,12}\/$/.test(u.pathname))return u.origin+u.pathname;
  return null;
 }catch{return null;}
}
export function parseRentalCatalog(html,rawUrl){
 const url=rentalCatalogUrl(rawUrl);if(!url)return null;
 const title=text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]),observedLinks=[];
 const rows=new URL(url).hostname==='m.fang.com'?/<li\b[^>]*>([\s\S]*?)<\/li>/gi:/<dl\b[^>]*class=["'][^"']*\blist\b[^"']*["'][^>]*>([\s\S]*?)<\/dl>/gi;
 for(const m of html.matchAll(rows)){
  const row=m[1],summary=text(row).slice(0,450);let link=null;
  for(const a of row.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
   const href=attr(a[1],'href');try{const target=rentalDetailUrl(new URL(href,url).href);if(target){link={url:target,title:text(a[2])||summary.slice(0,100),summary};if(text(a[2]))break;}}catch{}
  }
  // The location row is distinct from the advert/property title (e.g. a
  // development named after another district). It is only a navigation hint;
  // eligibility still requires this listing's own detail-page evidence.
  const district=[...row.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>text(m[1].replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi,''))).map(value=>/^([\p{L}]{1,16})\s*[-－]\s*\S/u.exec(value)?.[1]).find(Boolean);
  if(link&&district)link.location={district};
  if(link&&!observedLinks.some(l=>l.url===link.url))observedLinks.push(link);
  if(observedLinks.length>=24)break;
 }
 const observedCatalogLinks=[],city=raw=>{const u=new URL(raw);return u.hostname==='m.fang.com'?u.pathname.split('/')[2].split('_')[0]:u.pathname.split('/')[1];};
 for(const a of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))try{
  const target=rentalCatalogUrl(new URL(attr(a[1],'href'),url).href),label=text(a[2]);
  if(target&&target!==url&&city(target)===city(url)&&label&&label.length<=80&&label!=='不限'&&!observedCatalogLinks.some(l=>l.url===target))observedCatalogLinks.push({url:target,title:label,kind:'catalog'});
 }catch{}
 if(!observedLinks.length&&!observedCatalogLinks.length)return null;
 const districtSection=/<section\b[^>]*id=["']district_section["'][^>]*>([\s\S]*?)<\/section>/i.exec(html)?.[1]||'';
 const districts=[...new Set([...districtSection.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m=>attr(m[1],'data-comarea')).map(m=>text(m[2])).filter(name=>name&&name.length<=16))];
 return {url,title,observedLinks,observedCatalogLinks:observedCatalogLinks.slice(0,30),...(districts.length?{districts}:{}),text:[title,...observedCatalogLinks.slice(0,30).map(l=>'目录筛选：'+l.title+'\n'+l.url),...observedLinks.map(l=>l.summary+'\n'+l.url)].join('\n\n')};
}
export function parseRentalPage(html,rawUrl){
 const url=rentalDetailUrl(rawUrl);if(!url)return null;
 if(new URL(url).hostname==='m.fang.com')return parseMobileRentalPage(html,url);
 const title=text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
 if(!/小区租房/.test(title))return null;
 const priceText=text(/<div[^>]*class=["'][^"']*\btrl-item\s+sty1\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1]);
 const priceMatch=/(\d+(?:\.\d+)?)\s*元\s*\/\s*月/.exec(priceText);
 if(!priceMatch||/起|参考|券后|补贴/.test(priceText))return null;
 for(const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{
  const item=JSON.parse(script[1]);if(item['@type']!=='Product')continue;
  if(item.url&&rentalDetailUrl(item.url)!==url)return null;
  if(Number.isFinite(Number(item.offers?.price))&&Number(item.offers.price)!==Number(priceMatch[1]))return null;
  break;
 }catch{}
 const attributes=[];
 const pattern=/<div[^>]*class=["'][^"']*\btrl-item1\b[^"']*["'][^>]*>\s*<div[^>]*class=["']tt["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["']font14["'][^>]*>([\s\S]*?)<\/div>/gi;
 for(const m of html.matchAll(pattern))attributes.push({label:text(m[2]),value:text(m[1])});
 const areaQuote=attributes.find(a=>a.label==='建筑面积')?.value,area=Number(/^(\d+(?:\.\d+)?)\s*(?:平米|㎡|平方米)$/.exec(areaQuote||'')?.[1]);
 const rentalType=attributes.find(a=>a.label==='出租方式')?.value;
 if(!Number.isFinite(area)||area<=0||!['整租','合租'].includes(rentalType))return null;
 const community=title.split('小区租房')[0].trim();if(!community)return null;
 const details=[...html.matchAll(/<div[^>]*class=["']rcont["'][^>]*>([\s\S]*?)<\/div>/gi)].map(m=>text(m[1]));
 const metroQuote=details.find(t=>/^距离.+站\s*\d+\s*米$/.test(t)),metro=Number(/(\d+)\s*米$/.exec(metroQuote||'')?.[1]);
 const images=[];
 for(const m of divBlock(html,'bigImg').matchAll(/<img\b[^>]*>/gi)){
  if(attr(m[0],'imagetype')!=='室内图')continue;
  try{const u=new URL(attr(m[0],'data-src')||attr(m[0],'src'),url);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)soufunimg\.com$/.test(u.hostname)&&!images.includes(u.href))images.push(u.href);}catch{}
 }
 const observedText=[title,priceText,...attributes.map(a=>a.value+' '+a.label),...details].join('\n');
 return {url,title,name:community,listingId:/3_(\d+)_/.exec(url)[1],text:observedText,price:Number(priceMatch[1]),priceQuote:priceMatch[0],area,areaQuote,rentalType,attributes,metro:Number.isFinite(metro)?metro:null,metroQuote:metroQuote||null,images:images.slice(0,12)};
}
function parseMobileRentalPage(html,url){
 const title=text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]),listingId=/[13]_(\d+)\.html$/.exec(url)?.[1];
 // Bind metadata to the script describing THIS listing, never to a recommended
 // listing or a footer that merely mentions the requested place.
 const mainScript=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(script=>new RegExp('pageConfig\\.houseid\\s*=\\s*["\']'+listingId+'["\']').test(script))||'';
 const config=key=>decode(new RegExp('pageConfig\\.'+key+'\\s*=\\s*["\']([^"\']*)["\']').exec(mainScript)?.[1]||'');
 if(config('houseid')!==listingId||!config('projname')||!title.includes(config('projname')))return null;
 const name=config('projname'),priceText=text(divBlock(html,'zf-price')),priceMatch=/(\d+(?:\.\d+)?)\s*元\s*\/\s*月/.exec(priceText);
 if(!priceMatch||/起|参考|券后|补贴/.test(priceText))return null;
 const info=/<ul\b[^>]*class=["'][^"']*\bhxStyle-left\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i.exec(html)?.[1]||'';
 const rows=[...info.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>text(m[1]));
 const areaQuote=rows.find(row=>/面积/.test(row))?.match(/\d+(?:\.\d+)?\s*(?:㎡|平米|平方米)/)?.[0],area=Number(/\d+(?:\.\d+)?/.exec(areaQuote||'')?.[0]);
 const rentalType=rows.find(row=>/整租|合租/.test(row))?.match(/整租|合租/)?.[0];
 if(!Number.isFinite(area)||area<=0||!rentalType||config('area')&&Number(config('area'))!==area||config('price')&&Number(config('price'))!==Number(priceMatch[1]))return null;
 const images=[];
 for(const slide of divBlock(html,'xqfocusbox').matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)){
  if(attr(slide[1],'data-name')!=='图片')continue;
  for(const tag of slide[2].matchAll(/<img\b[^>]*>/gi))try{const u=new URL(attr(tag[0],'data-src')||attr(tag[0],'src'),url);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)soufunimg\.com$/.test(u.hostname)&&!images.includes(u.href))images.push(u.href);}catch{}
 }
 const metroQuote=config('subway'),metro=Number(/(\d+)\s*米/.exec(metroQuote)?.[1]);
 const city=config('cityname'),district=config('district');
 const location=city&&district&&city.length<=16&&district.length<=16?{city,district,value:city+' · '+district,quote:'所在区域：'+city+' · '+district,provenance:{listingId,city:config('city'),cityname:city,district}}:null;
 const observedCatalogLinks=[];
 if(location)for(const a of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))try{
  const target=rentalCatalogUrl(new URL(attr(a[1],'href'),url).href);
  if(target&&new URL(target).pathname.startsWith('/zf/'+config('city')+'_')&&text(a[2])===district+'租房'&&!observedCatalogLinks.some(l=>l.url===target))observedCatalogLinks.push({url:target,title:text(a[2]),kind:'catalog'});
 }catch{}
 return {url,title,name,listingId,price:Number(priceMatch[1]),priceQuote:priceMatch[0],area,areaQuote,rentalType,rentalTypeQuote:rows.find(row=>row.includes(rentalType)),metro:Number.isFinite(metro)?metro:null,metroQuote:metroQuote||null,images:images.slice(0,12),attributes:[{label:'面积',value:areaQuote},{label:'出租方式',value:rentalType}],...(location?{location}:{}),observedCatalogLinks,text:[title,priceText,...rows,location?.quote,metroQuote].filter(Boolean).join('\n')};
}
export function decodeRentalHtml(bytes,contentType=''){
 const declaration=contentType+' '+bytes.subarray(0,4096).toString('latin1'),charset=/charset\s*=\s*["']?\s*([a-z0-9_-]+)/i.exec(declaration)?.[1]||'utf-8';
 return /^(?:gbk|gb2312|gb18030)$/i.test(charset)?new TextDecoder('gb18030').decode(bytes):bytes.toString('utf8');
}
const listingIdentity=url=>/\/([13])_(\d+)\.html$/.exec(url)?.slice(1).join('_')||/\/chuzu\/(3)_(\d+)_\d\.htm$/.exec(url)?.slice(1).join('_');
export function rentalRedirectUrl(current,location){
 try{
  if(!rentalDetailUrl(current)&&!rentalCatalogUrl(current))return null;
  const target=new URL(location,current).href,next=rentalDetailUrl(target)||rentalCatalogUrl(target);
  if(!next||next===current)return null;
  return listingIdentity(current)===listingIdentity(next)?next:null;
 }catch{return null;}
}
// Follow only observed HTTPS redirects within this public reader, preserving listing identity.
async function readHtml(url,remaining=2){
 return new Promise((resolve,reject)=>{
  const system=typeof tls.getCACertificates==='function'?tls.getCACertificates('system'):[];
  const req=request(url,{agent:false,ca:system.length?[...tls.rootCertificates,...system]:undefined,headers:{'User-Agent':'Mozilla/5.0 (compatible; PrismPublicReader/0.4)'}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){
    res.resume();const next=rentalRedirectUrl(url,res.headers.location);
    if(!remaining||!next){reject(new Error('房源跳转未能保持公开目录或同一房源身份'));return;}
    readHtml(next,remaining-1).then(resolve,reject);return;
   }
   if(res.statusCode!==200){res.resume();reject(new Error('房源详情未公开读取'));return;}
   let size=0;const chunks=[];
   res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000)req.destroy(new Error('房源页面过大'));else chunks.push(chunk);});
   res.on('end',()=>{try{let bytes=Buffer.concat(chunks);const encoding=res.headers['content-encoding'],options={maxOutputLength:2_000_000};if(encoding==='gzip')bytes=gunzipSync(bytes,options);else if(encoding==='deflate')bytes=inflateSync(bytes,options);else if(encoding==='br')bytes=brotliDecompressSync(bytes,options);resolve({html:decodeRentalHtml(bytes,res.headers['content-type']),url});}catch(error){reject(error);}});res.on('error',reject);
  });
  req.setTimeout(15000,()=>req.destroy(new Error('房源读取超时')));req.on('error',reject);req.end();
 });
}
export async function readPublicRentalPage(rawUrl){
 const catalog=rentalCatalogUrl(rawUrl),url=rentalDetailUrl(rawUrl)||catalog;if(!url)return null;
 const response=await readHtml(url);
 if(catalog){const page=parseRentalCatalog(response.html,response.url);if(!page)throw new Error('没有取得可公开读取的房源列表');return {...page,requestedUrl:url,observedAt:new Date().toISOString()};}
 const observation=parseRentalPage(response.html,response.url);if(!observation)throw new Error('房源主信息未能与详情页对应，未填入猜测值');
 return {url:observation.url,requestedUrl:url,text:observation.text,title:observation.title,pageIdentity:{name:observation.name},rentalObservation:observation,observedCatalogLinks:observation.observedCatalogLinks||[],observedAt:new Date().toISOString()};
}
export function requestedRentalDistrict(question,districts,city){
 const request=String(question||'').replace(/\s/g,'');
 if(/(?:区域|地区|行政区)(?:不限制|不限|无要求)|不限(?:区域|地区|行政区)|不限制(?:区域|地区|行政区)/.test(request))return null;
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return districts.find(name=>{
  const place=escape(name.replace(/区$/,'')),cityName=escape(String(city||'').replace(/市$/,''));
  return request.split(/[，,。；;\n]/).some(clause=>!/(?:不要|排除|不选|不在)/.test(clause)&&new RegExp('(?:'+cityName+'市?'+place+'区?|(?:在|只看|只找|限于|区域[为是：:]?)'+place+'区?)(?:租房|找房|租|整租|的|附近|范围|$)').test(clause));
 })||null;
}
export function resolveRentalCity(cities,location){
 const requested=String(location||'').trim().replace(/市$/,'');
 const normalize=name=>name.replace(/市$/,'');
 return cities.find(c=>normalize(c.name)===requested)||cities.filter(c=>requested.startsWith(normalize(c.name))&&/^[\p{Script=Han}]{1,16}$/u.test(requested.slice(normalize(c.name).length))).sort((a,b)=>b.name.length-a.name.length)[0]||null;
}
export async function discoverPublicRentalCatalog(location,{question='',scopeValue}={}){
 if(typeof location!=='string'||!location.trim()||location.length>30)throw new Error('无效的租房城市');
 const index=await readHtml(rentalCityIndexURL),cities=parseRentalCities(index.html);
 const city=resolveRentalCity(cities,location);if(!city)throw new Error('公开城市目录未找到这个城市，未猜测城市代码');
 const page=await readPublicRentalPage(city.url);
 if(!String(page.title||'').includes(city.name.replace(/市$/,'')))throw new Error('目录标题与所选城市不符，未采用其他城市的结果');
 const cityObservation={name:city.name,url:city.url,sourceURL:rentalCityIndexURL};
 const district=scopeValue!==undefined?(page.districts||[]).find(name=>scopeValue===city.name+' · '+name):requestedRentalDistrict(question,page.districts||[],city.name);
 if(!district)return {...page,cityObservation};
 const requestedRegion={city:city.name,district},scoped={...page,cityObservation,requestedRegion};
 // District controls use JavaScript rather than hrefs. Do not manufacture a
 // URL from their internal IDs: follow an actual listing's observed breadcrumb.
 for(const link of page.observedLinks.filter(link=>link.location?.district===district).slice(0,2))try{
  const detail=await readPublicRentalPage(link.url),o=detail.rentalObservation;
  if(o?.location?.city!==city.name||o.location.district!==district)continue;
  const breadcrumb=o.observedCatalogLinks?.[0];if(!breadcrumb)continue;
  const regional=await readPublicRentalPage(breadcrumb.url);
  if(!regional.title.includes(city.name)||!regional.title.includes(district))continue;
  return {...regional,districts:page.districts,cityObservation,requestedRegion,navigationEvidence:{catalogUrl:page.url,detailUrl:detail.url,breadcrumb:breadcrumb.url,location:o.location},seedPages:[detail]};
 }catch{}
 return scoped;
}
export function attachRentalPage(source,page){
 const requested=rentalDetailUrl(source.url)||rentalCatalogUrl(source.url),effective=rentalDetailUrl(page?.url)||rentalCatalogUrl(page?.url);
 if(requested&&effective&&requested!==effective&&page.requestedUrl===requested){
  const oldId=listingIdentity(requested),newId=listingIdentity(effective);
  if(oldId===newId){source.retrieval={...source.retrieval,redirectedFrom:source.url};source.url=effective;}
 }
 if(page?.observedLinks&&rentalCatalogUrl(source.url)===page.url){source.observedLinks=page.observedLinks.filter(l=>rentalDetailUrl(l.url)).slice(0,24);source.observedCatalogLinks=(page.observedCatalogLinks||[]).filter(l=>rentalCatalogUrl(l.url)).slice(0,30);source.title=page.title;if(page.cityObservation)source.retrieval={...source.retrieval,cityObservation:structuredClone(page.cityObservation)};if(page.requestedRegion)source.retrieval={...source.retrieval,requestedRegion:structuredClone(page.requestedRegion),navigationEvidence:page.navigationEvidence};}
 const o=page?.rentalObservation;
 if(!o||rentalDetailUrl(source.url)!==o.url||o.name!==page.pageIdentity?.name)return;
 source.title=o.title;source.pageIdentity={name:o.name};source.rentalObservation=structuredClone(o);
 if(page.observedAt&&!Number.isNaN(Date.parse(page.observedAt)))source.retrievedAt=page.observedAt;
 return true;
}
export function bindRentalImages(candidates,sources){
 for(const c of candidates){
  const source=sources.find(s=>s.id===c.sourceId),o=source?.rentalObservation;
  if(!o||!o.images.length||!c.name.includes(source.pageIdentity?.name||'\u0000')||rentalDetailUrl(source.url)!==o.url)continue;
  c.media={url:o.images[0],images:[...o.images],sourceId:source.id,sourceUrl:o.url,kind:'listing-photo',label:'该房源原页图片 · 平台发布，未实地核验'};
 }
}
// This adapter exposes observed values to whichever dimensions the agent chose.
// It does not add requirements or infer travel times, room quality or amenities.
export function rentalRawCandidate(source,schema){
 const o=source.rentalObservation;if(!o)return null;
 const facts={};
 for(const f of schema.fields){
  const label=f.label+' '+(f.aliases||[]).join(' ');let value,quote;
  if(isMonthlyAmountField(f)&&/租金|月租|租价|租赁|预算/.test(label)){value=o.price;quote=o.priceQuote;}
  else if(convertQuantity(1,f.unit,'㎡')===1&&/面积/.test(label)){value=o.area;quote=o.areaQuote;}
  else if(f.unit==='米'&&/地铁/.test(label)&&Number.isFinite(o.metro)){value=o.metro;quote=o.metroQuote;}
  else if(f.type==='enum'&&/(?:租赁|出租|租住|租房|房源)(?:方式|类型)|整租|合租/.test(label)&&f.options.includes(o.rentalType)){value=o.rentalType;quote=o.rentalTypeQuote||o.rentalType+' 出租方式';}
  else if(f.type==='boolean'&&/(?:是否)?整租/.test(label)&&o.rentalType==='整租'){value=true;quote=o.rentalTypeQuote||o.rentalType+' 出租方式';}
  else if(f.type==='enum'&&o.location&&/区域|地区|行政区|district|location/i.test(label)&&f.options.includes(o.location.value)){value=o.location.value;quote=o.location.quote;}
  if(value!==undefined)facts[f.key]={value,quote,sourceId:source.id};
 }
 return {name:o.name,sourceId:source.id,facts};
}
