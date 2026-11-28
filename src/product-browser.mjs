import {chromium} from 'playwright-core';
import {parseProductPage,assertPublicPage} from './public-product-page.mjs';
import {parseRetailCatalog} from './retail-page.mjs';

const domains=['jd.com','tmall.com','taobao.com','lenovo.com.cn','hpstore.cn','vmall.com','logitech.com','logitech.com.cn','waveshare.net','dfrobot.com.cn'];
export function browserProductUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))&&!/login|passport|signin|captcha|verify/i.test(u.hostname+u.pathname)?u.href:null;}catch{return null;}}
// Read-only fixed selectors, not a browser Agent which can log in or purchase.
// A blocked/login page is a failed read. No challenge solving or hidden price API.
async function withPublicPage(raw,env,read){
  const url=browserProductUrl(raw);if(!url)throw new Error('该平台尚未提供浏览器详情读取');await assertPublicPage(url);
  const browser=await chromium.launch({channel:env.PRISM_BROWSER_CHANNEL||'msedge',headless:true});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});await context.routeWebSocket('**/*',route=>route.close());
    const checked=new Map();await context.route('**/*',async route=>{const request=route.request();if(['image','media','font'].includes(request.resourceType()))return route.abort();
      try{const u=new URL(request.url());if(u.protocol!=='https:'||/login|passport|signin|captcha|verify/i.test(u.hostname+u.pathname))return route.abort();if(!checked.has(u.hostname))checked.set(u.hostname,assertPublicPage(u.origin).then(()=>true,()=>false));if(!await checked.get(u.hostname))return route.abort();return route.continue();}catch{return route.abort();}});
    const page=await context.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000});
    if(!browserProductUrl(page.url()))throw new Error('商品页跳转到了登录或不支持的页面');
    return await read(page);
  }finally{await browser.close();}
}
export async function readCatalogWithEdge(raw,env={}){
  return withPublicPage(raw,env,async page=>{await page.locator('a[href*="/shop/"]').first().waitFor({timeout:8000});const html=await page.content();return parseRetailCatalog(html,page.url());});
}
export async function readProductWithEdge(raw,env={}){
  const url=browserProductUrl(raw);
  return withPublicPage(raw,env,async page=>{
    if(new URL(url).hostname.endsWith('waveshare.net'))await page.locator('.sale-price').filter({hasText:/[¥￥]\s*\d/}).first().waitFor({timeout:10000});
    else await page.waitForTimeout(1500);
    const html=await page.content(),structured=parseProductPage(html,page.url());if(structured)return {...structured,reader:structured.reader?'edge-'+structured.reader:'edge-jsonld'};
    const snapshot=await page.evaluate(()=>{
      const title=document.querySelector('.sku-name,#itemName,#item-name,#name h1,.tb-detail-hd h1,.ItemHeader--mainTitle')?.textContent.trim()||'';
      const attributes=[...document.querySelectorAll('.Ptable-item li,.parameter2 li,.parameter-list li,#J_AttrUL li,.specifications li')].map(e=>e.textContent.trim()).filter(s=>s.length<300).flatMap(quote=>{const m=/^([^：:]{1,40})[：:]\s*(.+)$/.exec(quote);return m?[{label:m[1].trim(),value:m[2].trim(),quote}]:[];});
      const price=document.querySelector('.summary-price-wrap .p-price,.summary-price .p-price,#summary-price .p-price')?.textContent.trim()||'';
      const seller=document.querySelector('#popbox .name a,.J-hove-wrap .name a,.shopName a,.shop-name')?.textContent.trim()||'';
      return {title,attributes,price,seller,text:document.body.innerText.slice(0,25000)};
    });
    if(!snapshot.title||/请.*登录|安全验证|访问验证/.test(snapshot.text.slice(0,300)))throw new Error('未取得匿名可读的具体商品信息');
    const find=pattern=>snapshot.attributes.find(a=>pattern.test(a.label))?.value||'',number=/[¥￥]\s*(\d+(?:\.\d+)?)/.exec(snapshot.price),conditions=/券后|补贴后|会员价|到手价/.test(snapshot.price)?snapshot.price:'';
    const quote=snapshot.price,offers=number?[{price:Number(number[1]),currency:'CNY',seller:snapshot.seller||new URL(url).hostname,quote,basis:conditions?'conditional':'public',conditions,availability:'unknown',shipping:null}]:[];
    return {url:page.url(),title:snapshot.title,text:[snapshot.title,snapshot.text,...snapshot.attributes.map(a=>a.quote),...(quote?[quote]:[])].join('\n'),observedAt:new Date().toISOString(),reader:'edge-dom',productObservation:{name:snapshot.title,brand:find(/^(品牌|brand)$/i),model:find(/^(型号|产品型号|完整型号|mpn|model)$/i),attributes:snapshot.attributes,offers,provenance:'实际公开页面 DOM；固定只读选择器'}};
  });
}
