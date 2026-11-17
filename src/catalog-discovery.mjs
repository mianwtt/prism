import {suningMobileUrl,parseSuningSnapshot} from './merchant-browser.mjs';
import {partitionProductData} from './product-data.mjs';
export function specificationSnapshot(){
 const table=[...document.querySelectorAll('table')].find(t=>t.textContent.includes('详细参数'));
 return {url:location.href,title:document.title,text:table?'# '+document.title+'\n'+[...table.querySelectorAll('td')].map(td=>td.textContent.trim()).join('\n'):''};
}
export function catalogProductFits(product,settings){
 const f=product.fields;
 return product.status==='comparison-ready'&&f.priceCNY.value<=settings.budget&&f.memoryGB.value>=settings.minMemory&&f.weightKg.value<=settings.maxWeight;
}

export function selectCatalogProducts(items,{maxWeight=2,minMemory=16,limit=16}={}){
 const byUrl=new Map();for(const p of items){const url=suningMobileUrl(p.url);if(!url||!p.name||p.name.length<12)continue;const prior=byUrl.get(url);if(!prior||p.name.length>prior.name.length)byUrl.set(url,{...p,url});}
 const unique=[...byUrl.values()];
 const pool=unique.filter(p=>{
  const ram=/(\d+)\s*(?:GB|G)(?![a-z])/i.exec(p.name);
  return (!ram||Number(ram[1])>=minMemory)&&(maxWeight>2||!/(?:游戏|电竞|拯救者|暗影精灵|天选|RTX\s*\d)/i.test(p.name));
 });
 const brand=name=>/惠普|\bhp\b/i.test(name)?'hp':/联想|Lenovo|YOGA|ThinkBook|ThinkPad/i.test(name)?'lenovo':/华硕|ASUS|灵耀|无畏/i.test(name)?'asus':/戴尔|DELL/i.test(name)?'dell':/华为|Huawei|MateBook/i.test(name)?'huawei':'other';
 const groups=new Map();for(const p of pool){const key=brand(p.name);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 const picked=[];while(picked.length<limit&&[...groups.values()].some(g=>g.length))for(const group of groups.values())if(group.length&&picked.length<limit)picked.push(group.shift());
 return picked;
}

export async function discoverMerchantProducts(settings,{env={},onProgress=()=>{},limit=8,attemptLimit=16,excludeUrls=[]}={}){
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({channel:env.PRISM_BROWSER_CHANNEL||'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const records=[],catalogSources=[],errors=[];let checked=0;
 const key='catalog-'+Date.now().toString(36);
 try{
  const catalog=await context.newPage();
  const keywords=['轻薄本','笔记本'];
  const items=[];
  for(const keyword of keywords){
   const url='https://search.suning.com/'+encodeURIComponent(keyword)+'/';
   onProgress(`浏览苏宁公开商品目录：${keyword}`);
   try{
    await catalog.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    await catalog.locator('a[href*="product.suning.com/"]').first().waitFor({timeout:8000});
    const snapshot=await catalog.evaluate(()=>{
     const grouped=new Map();
     for(const a of document.querySelectorAll('a[href*="product.suning.com/"]')){
      const item=grouped.get(a.href)||{url:a.href,name:'',image:null};
      const name=(a.title||a.innerText||a.querySelector('img')?.alt||'').trim();
      const branded=s=>/惠普|戴尔|联想|华硕|ASUS|DELL|Lenovo|ThinkPad|ThinkBook|YOGA|HP|笔记本电脑/i.test(s);
      if((branded(name)&&!branded(item.name))||(branded(name)===branded(item.name)&&name.length>item.name.length))item.name=name;
      const img=a.querySelector('img'),src=img?.getAttribute('src2')||img?.getAttribute('data-src')||img?.getAttribute('data-original')||img?.src;
      if(src)item.image=new URL(src,location.href).href;
      grouped.set(a.href,item);
     }
     return {url:location.href,title:document.title,text:document.body.innerText.slice(0,40000),items:[...grouped.values()]};
    });
    catalogSources.push({id:key+'-list-'+catalogSources.length,url:snapshot.url,title:snapshot.title,text:snapshot.text,kind:'page',retrievedAt:new Date().toISOString(),retrieval:{method:'public-catalog',platform:'苏宁'}});
    items.push(...snapshot.items);
   }catch(error){errors.push('目录读取失败：'+keyword);onProgress(`目录「${keyword}」暂未取得商品链接，继续其他目录`);}
  }
  await catalog.close();
  const excluded=new Set(excludeUrls.map(suningMobileUrl).filter(Boolean));
  const selected=selectCatalogProducts(items.filter(p=>!excluded.has(suningMobileUrl(p.url))),{...settings,limit:attemptLimit});
  onProgress(`目录发现 ${new Set(items.map(p=>p.url)).size} 条商品线索，按品牌分散检查 ${selected.length} 个具体配置`);
  for(let offset=0;offset<selected.length&&partitionProductData(records).comparisonReady.filter(p=>catalogProductFits(p,settings)).length<limit;offset+=2){
   await Promise.all(selected.slice(offset,offset+2).map(async(item,index)=>{
    const page=await context.newPage();
    checked++;
    try{
     onProgress(`读取商品 ${offset+index+1}/${selected.length}：${item.name.slice(0,85)}`);
     await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:20000});
     await page.locator('.red-price').first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
     const snapshot=await page.evaluate(()=>({url:location.href,title:document.title,productTitle:document.querySelector('.price-content .product-title')?.innerText,priceText:document.querySelector('.price-content .red-price')?.innerText||'',text:document.body.innerText.slice(0,35000),images:[...document.querySelectorAll('.swiper-container img,.imgZoom img,.pro-img img')].map(i=>i.currentSrc||i.src).filter(u=>/^https:\/\/(?:[^/]+\.)?suning\.(?:cn|com)\//.test(u))}));
     if(suningMobileUrl(snapshot.url)!==item.url){onProgress('商品页发生跳转，未采纳');return;}
     const parsed=parseSuningSnapshot(snapshot);
     if(parsed.status!=='observed'){onProgress(`${item.name.slice(0,35)}：未读到公开标价，保留线索`);return;}
     // Read the exact seller/product specification URL, never another variant's page.
     const parts=new URL(item.url).pathname.match(/\/product\/(\d+)\/(\d+)\.html$/);
     const specUrl=`https://www.suning.com/itemcanshu/${parts[1]}/${parts[2]}.html`;
     await page.goto(specUrl,{waitUntil:'domcontentloaded',timeout:20000});
     await page.locator('body').waitFor();
     const spec=await page.evaluate(specificationSnapshot);
     if(!spec.text||suningMobileUrl(spec.url)!==item.url){onProgress('未取得同一商品的规格表，保留线索');return;}
     const compact=spec.text.replace(/(CPU型号|内存容量|硬盘容量|净重|操作系统|屏幕分辨率)\s*\n\s*/g,'$1');
     const images=[...new Set([...snapshot.images,...(/^https:\/\//.test(item.image||'')?[item.image]:[])])].slice(0,3).map(url=>({url,pageUrl:item.url}));
     records.push({key:key+'-'+parts[2],url:item.url,specificationUrl:spec.url,retrievedAt:new Date().toISOString(),specificationTitle:spec.title,specificationText:compact,images,offer:{...parsed,retrievedAt:new Date().toISOString(),snapshot}});
     const normalized=partitionProductData([records.at(-1)]);
     onProgress(normalized.comparisonReady.length?`已取得完整配置与标价：${parsed.configuration.slice(0,65)} · ¥${parsed.value}`:`已保存商品资料，配置尚有缺项：${parsed.configuration.slice(0,60)}`);
    }catch{errors.push(item.url);onProgress(`${item.name.slice(0,35)}：本次读取未完成，继续其他商品`);}
    finally{await page.close();}
   }));
  }
  const data=partitionProductData(records);
  data.comparisonReady.sort((a,b)=>Number(catalogProductFits(b,settings))-Number(catalogProductFits(a,settings)));
  return {...data,catalogSources,errors,discovered:new Set(items.map(p=>p.url)).size,checked};
 }finally{await context.close();await browser.close();}
}
