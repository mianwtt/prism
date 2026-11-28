import {load} from 'cheerio';
import {readPublicHtml} from './public-product-page.mjs';
import {parseRetailCatalog,catalogSearchUrl} from './retail-page.mjs';

const fold=value=>String(value||'').toLowerCase().replace(/树莓派/g,'raspberrypi').replace(/[^\p{L}\p{N}]/gu,'');
export function retailCatalogUrl(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(u.hostname==='www.dfrobot.com.cn'&&/^\/(?:search_elastic\.php|category[^/]*\.html)?$/.test(u.pathname))return u.href;
  if(/^(?:www\.)?waveshare\.net$/.test(u.hostname)&&(/^\/(?:list\.html|left_column\/[^/]+\.htm|product_catalog\.htm)$/.test(u.pathname)||u.pathname==='/'))return u.href;
  return null;
}catch{return null;}}
export function observedRetailNavigation(html,url){const $=load(html),result=[],seen=new Set();$('a[href]').each((_,el)=>{let target;try{target=new URL($(el).attr('href'),url).href;}catch{return;}if(!retailCatalogUrl(target)||seen.has(target)||new URL(target).origin!==new URL(url).origin)return;const title=$(el).text().trim();if(title.length<2||title.length>80)return;seen.add(target);result.push({url:target,title});});return result;}
export async function readRetailCatalogPage(url,env={}){
  const page=await readPublicHtml(url),parsed=parseRetailCatalog(page.html,page.url);parsed.observedCatalogLinks=observedRetailNavigation(page.html,page.url);
  parsed.text=[parsed.text,...parsed.observedCatalogLinks.map(l=>l.title+'\n'+l.url)].filter(Boolean).join('\n\n');
  if(!parsed.observedLinks.length&&!parsed.observedCatalogLinks.length){const {readCatalogWithEdge}=await import('./product-browser.mjs');return readCatalogWithEdge(url,env);}
  return parsed;
}
export async function discoverRetailCatalog(platform,keywords,env={}){
  if(typeof keywords!=='string'||!keywords.trim()||keywords.length>40)throw new Error('目录关键词无效');
  if(platform==='dfrobot'){
    keywords=keywords.replace(/树莓派\s*/g,'Raspberry Pi ');
    let home=await readPublicHtml('https://www.dfrobot.com.cn/'),searchUrl;
    try{searchUrl=catalogSearchUrl(home.html,home.url,keywords);}catch{
      // The marketing home and shop use different templates. Follow an actual
      // shop category link to obtain its public GET search form.
      const entry=observedRetailNavigation(home.html,home.url).find(l=>l.url!==home.url);
      if(!entry)throw new Error('商家首页未提供公开商品目录');home=await readPublicHtml(entry.url);
      searchUrl=catalogSearchUrl(home.html,home.url,keywords);
    }
    return readRetailCatalogPage(searchUrl,env);
  }
  if(platform!=='waveshare')throw new Error('不支持的公开目录');
  let page=await readPublicHtml('https://www.waveshare.net/');
  // Navigate actual category anchors. No category IDs or item URLs are guessed.
  for(let depth=0;depth<2;depth++){
    const links=observedRetailNavigation(page.html,page.url),terms=fold(keywords).replace(/\d+gb$/,'');
    const matches=links.filter(l=>{const title=fold(l.title);return title.length>=4&&(title===terms||terms.includes(title)||title.includes(terms));}).sort((a,b)=>Math.abs(fold(a.title).length-terms.length)-Math.abs(fold(b.title).length-terms.length));
    const chosen=matches[0]||links.find(l=>/产品目录/.test(l.title));
    if(!chosen)break;page=await readPublicHtml(chosen.url);const parsed=parseRetailCatalog(page.html,page.url);if(parsed.observedLinks.length){parsed.observedCatalogLinks=observedRetailNavigation(page.html,page.url);return parsed;}
  }
  return readRetailCatalogPage(page.url,env);
}
export function attachRetailCatalog(source,page){
  if(!page?.url||!retailCatalogUrl(page.url)||new URL(page.url).origin!==new URL(source.url).origin)return false;
  const links=items=>(Array.isArray(items)?items:[]).filter(l=>{try{return typeof l.title==='string'&&typeof l.url==='string'&&source.text.includes(l.url)&&new URL(l.url).origin===new URL(page.url).origin;}catch{return false;}}).slice(0,40);
  source.observedLinks=links(page.observedLinks);source.observedCatalogLinks=links(page.observedCatalogLinks);source.retrieval={...source.retrieval,method:'public-retail-catalog'};return true;
}
