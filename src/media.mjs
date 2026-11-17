import { safeUrl } from "./evidence.mjs";
import {isMerchantProduct} from './source-types.mjs';
export function matchesOfficialModel(candidate, source) {
  let hostname;
  try { hostname = new URL(source.url).hostname; } catch { return false; }
  const brands = [
    [/华为|huawei|matebook/i, /(^|\.)huawei\.com$/],
    [/华硕|asus|无畏|vivobook/i, /(^|\.)asus\.com(?:\.cn)?$/],
    [/惠普|\bhp\b|星\s*book/i, /(^|\.)(?:hp\.com|hpstore\.cn)$/],
    [/联想|lenovo|thinkbook|thinkpad/i, /(^|\.)lenovo\.com(?:\.cn)?$/],
    [/机械革命|mechrevo/i, /(^|\.)mechrevo\.com$/],
    [/apple|苹果|macbook/i, /(^|\.)apple\.com(?:\.cn)?$/],
  ];
  if (!brands.some(([name, domain]) => name.test(candidate.name) && domain.test(hostname))) return false;
  const clean = text => text.toLowerCase().replace(/\s+/g, "");
  const model = clean(candidate.name).match(/(?:matebook|vivobook|thinkbook|thinkpad|星book|无畏|蛟龙|macbook(?:air|pro)?)[a-z]*\d+/i)?.[0];
  return !!model && clean(source.title).includes(model);
}
export function matchesProductPage(candidate,source){
  if(matchesOfficialModel(candidate,source))return true;
  let url;try{url=new URL(source.url);}catch{return false;}
  const clean=s=>String(s||'').toLowerCase().replace(/\s+/g,'');
  const model=clean(candidate.name).match(/(?:matebook|vivobook|thinkbook|thinkpad|星book|无畏|蛟龙|macbook(?:air|pro)?)[a-z]*\d+/i)?.[0];
  if(!model||!clean(source.title).includes(model))return false;
  return isMerchantProduct(source)||/(^|\.)suning\.com$/.test(url.hostname)&&/itemcanshu|product|\/\d/.test(url.pathname)
    || /(^|\.)jd\.com$/.test(url.hostname)&&/item|ware/.test(url.hostname+url.pathname)
    || url.hostname==='detail.zol.com.cn'
    || url.hostname==='product.pconline.com.cn'&&url.pathname.startsWith('/notebook/');
}
export async function enrichCandidateMedia(candidates, sources, io, warnings = []) {
  if (typeof io.enrichImages !== "function") return;
  const references = candidate => [...new Set([
    ...Object.values(candidate.facts).flatMap(f => [f.sourceId, f.rejectedEvidence?.sourceId, ...(f.evidence || []).map(item => item.sourceId)]),
    ...sources.filter(s=>matchesProductPage(candidate,s)).map(s=>s.id),
  ])].filter(Boolean);
  const targets = [...new Set(candidates.slice(0,3).flatMap(candidate => sources.filter(s => references(candidate).includes(s.id) && s.url && matchesProductPage(candidate,s))
    .sort((a, b) => Number(matchesOfficialModel(candidate,b))-Number(matchesOfficialModel(candidate,a)) || Number(!!b.image)-Number(!!a.image)).slice(0,2).map(s=>s.url)))].slice(0,6);
  try {
    for (const image of await io.enrichImages(targets)) {
      const source = sources.find(s => s.url === image.sourceUrl);
      const url = safeUrl(image.url);
      if (source && url?.startsWith("https://")) source.image = { url, pageUrl: safeUrl(image.pageUrl) || source.url, kind: "page-preview", retrievedAt: new Date().toISOString() };
    }
  } catch { warnings.push("来源页配图读取失败；保留文字证据，图片不参与计算。"); }
  for (const candidate of candidates) {
    const source = sources.filter(s => references(candidate).includes(s.id) && s.image && matchesProductPage(candidate, s))
      .sort((a,b)=>Number(matchesOfficialModel(candidate,b))-Number(matchesOfficialModel(candidate,a)))[0];
    delete candidate.media;
    if (source) candidate.media = { ...source.image, sourceId: source.id, label: "来源系列配图 · 具体配置待核实" };
  }
}
