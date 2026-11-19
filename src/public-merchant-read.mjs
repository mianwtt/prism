import {suningMobileUrl,parseSuningSnapshot} from './merchant-browser.mjs';
import {convertQuantity,observationIssue} from './decision-evidence.mjs';
import {captureMerchantPage} from './merchant-page-dom.mjs';

export function merchantCatalogUrl(raw){
  try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname==='search.suning.com'&&u.pathname!=='/'&&!/\/(?:login|signin|auth|passport)(?:\/|$)/i.test(u.pathname)?u.origin+u.pathname+u.search:null;}catch{return null;}
}
const same=(a,b)=>Boolean(suningMobileUrl(a)&&suningMobileUrl(a)===suningMobileUrl(b));
const imageURL=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)suning\.(cn|com)$/.test(u.hostname)?u.href:null;}catch{return null;}};

// Read only the observed product identity, including its public parameter table.
// No category defaults, seller login, stock gate, guessed offer or catalog cover.
export function parseMerchantDetail(snapshot,specification=null){
  const url=suningMobileUrl(snapshot?.url);if(!url)return null;
  const name=String(snapshot.productTitle||'').trim();if(!name)return null;
  // CSS can split the currency, integer and cents into innerText lines. Preserve
  // the same primary element's actual textContent as a separately labeled quote.
  const primaryDOM=String(snapshot.priceDOMText||'').trim();
  const prices=Array.isArray(snapshot.priceObservations)?snapshot.priceObservations.slice(0,8):[{label:'主标价',raw:primaryDOM||snapshot.priceText||'',context:snapshot.priceContext||''}];
  const observedText=String(snapshot.text||'')+(primaryDOM?'\n商品主价格DOM文本\n'+primaryDOM:'')+prices.map(p=>'\n价格元素DOM文本（'+p.label+'）\n'+String(p.raw||'')+'\n去除排版空白：'+String(p.raw||'').replace(/\s+/g,'')).join('');
  const parsed=prices.filter(p=>['主标价','易购价'].includes(p.label)&&!/国补后|券后|补贴后|会员价|到手价/.test(p.context||p.raw||''))
    .map(p=>parseSuningSnapshot({...snapshot,text:observedText,priceText:String(p.raw||'').replace(/\s+/g,'')})).filter(p=>p.status==='observed');
  const offer=/定金|订金|尾款|预付款/.test(name)?{status:'non-full-price'}:parsed.length&&parsed.every(p=>p.value===parsed[0].value)?parsed[0]:{status:parsed.length?'conflicting-price':'no-readable-price'},attributes=[];
  const spec=same(url,specification?.url)?specification:null;
  for(const cell of (spec?.cells||[]).slice(0,150)){
    const match=/^\s*([^：:\n]{1,40})\s*[：:]\s*([^\n]{1,200})\s*$/.exec(String(cell));
    if(match)attributes.push({label:match[1].trim(),value:match[2].trim(),quote:String(cell).trim()});
  }
  const text=[snapshot.title,name,observedText,...attributes.map(a=>a.quote)].filter(Boolean).join('\n');
  return {url,name:name.slice(0,150),title:snapshot.title,text,attributes,
    specificationURL:spec?.url||null,images:[...new Set((snapshot.images||[]).map(imageURL).filter(Boolean))].slice(0,12),
    priceStatus:offer.status,offer:offer.status==='observed'?offer:null};
}

export async function readPublicMerchantPage(raw,env={},options={}){
  const catalog=merchantCatalogUrl(raw),url=suningMobileUrl(raw)||catalog;if(!url)return null;
  const {chromium}=await import('playwright-core');let browser;
  try{
    browser=await chromium.launch({channel:env.PRISM_BROWSER_CHANNEL||'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    if(catalog){
      await page.locator('a[href*="product.suning.com/"]').first().waitFor({timeout:7000}).catch(()=>{});
      if(merchantCatalogUrl(page.url())!==url)throw new Error('公开商品目录跳转');
      const applied={priceRange:false,sort:false};
      async function clickAndSettle(locator){const before=page.url();await locator.click({timeout:4000});await page.waitForURL(next=>next.href!==before,{timeout:8000}).catch(()=>{});await page.waitForLoadState('domcontentloaded',{timeout:8000}).catch(()=>{});await page.locator('a[href*="product.suning.com/"]').first().waitFor({timeout:5000}).catch(()=>{});return merchantCatalogUrl(page.url())!==merchantCatalogUrl(before);}
      const range=options.priceRange;
      if(range&&Number.isFinite(range.minimum)&&Number.isFinite(range.maximum)&&range.minimum>=0&&range.maximum>=range.minimum&&range.maximum<=1e9)try{
        await page.locator('.price-interval').first().hover({timeout:2000});
        const low=page.locator('#startM').first(),high=page.locator('#endM').first();await low.fill('',{timeout:2000});await low.pressSequentially(String(range.minimum));await high.fill('',{timeout:2000});await high.pressSequentially(String(range.maximum));
        applied.priceRange=await clickAndSettle(page.locator('#search_sure').first())&&await high.inputValue()===String(range.maximum);
      }catch{}
      if(options.sort==='price-ascending')try{const sort=page.locator('[name="ssdsn_search_sort_price"]').first();await clickAndSettle(sort);applied.sort=/(?:^|\s)asc(?:\s|$)/.test(await sort.getAttribute('class'));}catch{}
      const snapshot=await page.evaluate(()=>({url:location.href,title:document.title,
        items:[...document.querySelectorAll('a[href*="product.suning.com/"]')].map(a=>({url:a.href,title:(a.title||a.innerText||a.querySelector('img')?.alt||'').trim()}))}));
      if(!merchantCatalogUrl(snapshot.url))throw new Error('公开商品目录跳转');
      const links=new Map();for(const item of snapshot.items){const target=suningMobileUrl(item.url);if(target&&item.title.length>=4&&(!links.has(target)||links.get(target).title.length<item.title.length))links.set(target,{url:target,title:item.title.slice(0,200)});}
      const observedLinks=[...links.values()].slice(0,40);if(!observedLinks.length)throw new Error('公开目录未取得具体商品链接');
      return {url:merchantCatalogUrl(snapshot.url),title:snapshot.title,catalogFilters:{requested:options,applied},observedLinks,text:[snapshot.title,...observedLinks.map(l=>l.title+'\n'+l.url)].join('\n\n'),observedAt:new Date().toISOString()};
    }
    await page.waitForFunction(()=>Boolean(document.querySelector('.price-content > div.red-price')||[...document.querySelectorAll('.price-at-hand .to-hand-price-detail .item .desc1')].some(e=>e.textContent.trim()==='易购价')),{},{timeout:7000}).catch(()=>{});
    const snapshot=await page.evaluate(captureMerchantPage);
    if(!same(snapshot.url,url))throw new Error('商品跳转后身份不一致');
    const parts=new URL(url).pathname.match(/\/product\/(\d+)\/(\d+)\.html$/);let specification=null;
    try{
      await page.goto(`https://www.suning.com/itemcanshu/${parts[1]}/${parts[2]}.html`,{waitUntil:'domcontentloaded',timeout:15000});
      specification=await page.evaluate(()=>{const table=[...document.querySelectorAll('table')].find(t=>t.textContent.includes('详细参数'));
        return {url:location.href,cells:table?[...table.querySelectorAll('td')].filter(td=>!td.querySelector('table')).map(td=>td.textContent.trim().replace(/\s+/g,' ')):[]};});
    }catch{}
    const observation=parseMerchantDetail(snapshot,specification);if(!observation)throw new Error('公开商品信息未能对应');
    return {url,title:observation.title,text:observation.text,merchantObservation:observation,observedAt:new Date().toISOString()};
  }finally{await browser?.close();}
}

export function attachMerchantPage(source,page){
  if(merchantCatalogUrl(source.url)===page?.url&&page?.observedLinks){source.title=page.title;source.observedLinks=page.observedLinks.filter(l=>suningMobileUrl(l.url));if(page.catalogFilters)source.retrieval={...source.retrieval,catalogFilters:structuredClone(page.catalogFilters)};}
  const o=page?.merchantObservation;if(!o||!same(source.url,o.url))return false;
  source.title=o.title;source.merchantObservation=structuredClone(o);source.pageIdentity={name:o.name};
  source.retrieval={...source.retrieval,method:'public-merchant-detail',specificationURL:o.specificationURL,priceSourceUrl:o.url};
  if(o.offer)source.publicPrice={value:o.offer.value,quote:o.offer.quote,currency:'CNY',observedAt:page.observedAt};
  return true;
}
const normalize=s=>String(s||'').replace(/[\s()（）]/g,'').replace(/(?:GB|TB|kg|千克|公斤|元|CNY)$/i,'').toLowerCase();
const synonyms={'内存容量':['内存','ram'],'运行内存':['内存','ram'],'机身内存':['存储','存储容量','rom','机身存储','机身存储容量'],'硬盘容量':['硬盘','固态硬盘','固态硬盘容量','存储','存储容量','ssd','ssd容量'],'净重':['重量','机身重量','机身净重','weight'],'重量':['净重','机身重量','机身净重','weight']};
export function merchantRawCandidate(source,schema){
  const o=source.merchantObservation;if(!o)return null;const facts={};
  for(const f of schema.fields){
    if((f.type||'number')!=='number')continue;
    if(o.offer&&/^(元|CNY|人民币)$/i.test(f.unit)&&/价格|售价|标价|报价|预算|price|cost/i.test([f.label,...(f.aliases||[])].join(' '))){facts[f.key]={value:o.offer.value,quote:o.offer.quote,sourceId:source.id};continue;}
    const terms=[f.label,...(f.aliases||[])].map(normalize).filter(s=>s.length>=2);
    const matches=o.attributes.filter(a=>{const labels=[a.label,...(synonyms[a.label]||[])].map(normalize);return terms.some(t=>labels.includes(t));});
    const observations=[];
    for(const a of matches){
      if(a.label==='硬盘容量'&&/固态|ssd/i.test([f.label,...(f.aliases||[])].join(' '))&&!o.attributes.some(x=>x.label==='硬盘类型'&&/固态|ssd/i.test(x.value)))continue;
      const quantity=/^(\d+(?:\.\d+)?)\s*([A-Za-z²㎡]+|千克|公斤|克|平方米|平米|元)\s*$/i.exec(a.value);if(!quantity)continue;
      const value=convertQuantity(Number(quantity[1]),quantity[2],f.unit);if(value===null)continue;
      const fact={value,quote:a.quote,sourceId:source.id};if(!observationIssue(f,fact,source))observations.push(fact);
    }
    if(observations.length&&observations.every(x=>x.value===observations[0].value))facts[f.key]=observations[0];
  }
  return {name:o.name,sourceId:source.id,facts};
}
export function bindMerchantImages(candidates,sources){
  for(const c of candidates){const source=sources.find(s=>s.id===c.sourceId),o=source?.merchantObservation;
    if(!o||c.name!==o.name||!same(source.url,o.url)||!o.images.length)continue;
    c.media={url:o.images[0],images:[...o.images],sourceId:source.id,sourceUrl:o.url,kind:'product-photo',label:'该商品原页图片 · 参数以同一商品规格表为准'};
  }
}
