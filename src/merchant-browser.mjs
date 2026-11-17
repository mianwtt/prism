export function suningMobileUrl(raw){
 let u;try{u=new URL(raw);}catch{return null;}
 if(!/(^|\.)suning\.com$/.test(u.hostname))return null;
 const m=u.pathname.match(/\/(\d+)\/(\d+)\.html$/);
 if(!m)return null;
 return `https://m.suning.com/product/${m[1]}/${m[2].replace(/^0+(?=\d)/,'')}.html`;
}
export function parseSuningSnapshot(snapshot){
 const text=String(snapshot.text||''),priceText=String(snapshot.priceText||'').trim();
 const match=/^[¥￥]\s*(\d+(?:\.\d{1,2})?)$/.exec(priceText);
 if(!match||!text.includes(priceText))return {status:'no-readable-price',reason:'商品主价格不可读，未猜测金额'};
 const value=Number(match[1]);
 if(value<=0||value>1000000000)return {status:'invalid-price',reason:'页面标价数值无效'};
 const availability=/(?:^|\n)\s*无货\s*(?:\n|$)/.test(text)?'out-of-stock':/(?:^|\n)\s*(?:有货|现货)\s*(?:\n|$)/.test(text)?'in-stock':'unknown';
 const regionText=/送至\s*\n([^\n]+)/.exec(text)?.[1]?.trim()||'';
 const region=regionText&&!/选择|请选择|加载/.test(regionText)?regionText:null;
 const sku=/\b(?:16-)?(bu\d{4}tu)\b/i.exec(snapshot.productTitle||snapshot.title||'')?.[1]?.toUpperCase();
 return {status:'observed',value,currency:'CNY',kind:'merchant-listed',quote:priceText,configuration:snapshot.productTitle||snapshot.title,
   productKey:sku?'HP:'+sku:null,availability,region,conditions:(text.match(/[^\n]*(?:国补|会员|以结算|返\d+云钻)[^\n]*/g)||[]).slice(0,6),
   label:availability==='out-of-stock'?(region?'商家标价 · 所选地区无货':'商家标价 · 显示无货，地区未确认'):'商家页面标价 · 结算待核实'};
}
export async function readPublicMerchantOffer(raw,env={}){
 const url=suningMobileUrl(raw);
 if(!url)return {status:'unsupported',reason:'此读取器仅验证苏宁公开商品移动页'};
 let browser;
 try{
  const {chromium}=await import('playwright-core');
  browser=await chromium.launch({channel:env.PRISM_BROWSER_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
  await page.locator('.red-price').first().waitFor({state:'visible',timeout:7000}).catch(()=>{});
  const snapshot=await page.evaluate(()=>({url:location.href,title:document.title,productTitle:document.querySelector('.price-content .product-title')?.innerText,
    priceText:document.querySelector('.price-content .red-price')?.innerText||'',text:document.body.innerText.slice(0,16000)}));
  if(!snapshot.url.startsWith('https://m.suning.com/product/'))return {status:'login-or-redirect',reason:'商品页跳转，未取得报价'};
  return {...parseSuningSnapshot(snapshot),snapshot,retrievedAt:new Date().toISOString()};
 }catch{return {status:'unavailable',reason:'本机 Chrome 不可用或公开商品页读取失败'};}
 finally{await browser?.close();}
}
