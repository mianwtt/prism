import {sourceSite} from './decision-evidence.mjs';

export async function responseJson(response,limit=4_000_000){
  if(!response.ok)throw new Error('研究服务 HTTP '+response.status);
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw new Error('研究服务响应过大');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function serviceUrl(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('研究服务地址无效');return u;}
export async function searchSearxng(query,env,{maxResults=10,fetchFn=fetch}={}){
  const base=serviceUrl(env.SEARXNG_URL||env.TOFU_SEARCH_SEARXNG_URL),url=new URL(base.href.replace(/\/$/,'')+(base.pathname.endsWith('/search')?'':'/search'));
  url.searchParams.set('q',query);url.searchParams.set('format','json');url.searchParams.set('language','auto');
  if(env.SEARXNG_ENGINES)url.searchParams.set('engines',env.SEARXNG_ENGINES);
  const result=await responseJson(await fetchFn(url,{signal:AbortSignal.timeout(30000),redirect:'error',headers:{Accept:'application/json'}}));
  return (Array.isArray(result.results)?result.results:[]).slice(0,Math.min(12,maxResults)).map(r=>({url:r.url,title:r.title,content:r.content||'',engine:'searxng:'+String(r.engine||r.engines?.join(',')||''),retrieval:{snippetOnly:true,searchProvider:'searxng'}}));
}
function canonical(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^spm$|^ref$/.test(k))u.searchParams.delete(k);return u.href;}catch{return null;}}
// Broader discovery uses independent configured services, then round-robins sites.
// No provider is assumed healthy, and more result URLs are never called verified offers.
export async function federatedSearch(query,drivers,{primary='tofu',purpose='research',maxResults=8}={}){
  const names=[...new Set([primary,...Object.keys(drivers)])].filter(n=>typeof drivers[n]==='function'),limit=Math.min(12,Math.max(4,maxResults));
  const selected=purpose==='offers'?names.slice(0,3):names.slice(0,1),results=await Promise.allSettled(selected.map(n=>drivers[n](query,{maxResults:limit}))),rows=[],errors=[],details=[];
  for(let i=0;i<results.length;i++){const r=results[i];if(r.status==='rejected'){errors.push(selected[i]);details.push(selected[i]+': '+String(r.reason?.message||'请求失败').slice(0,160));continue;}for(const row of Array.isArray(r.value)?r.value:[]){const url=canonical(row?.url);if(url)rows.push({...row,url,retrieval:{...row.retrieval,searchProvider:selected[i]}});}}
  if(purpose!=='offers'&&(rows.length<3||new Set(rows.map(r=>sourceSite(r.url))).size<2))for(const name of names.slice(1,3))try{for(const row of await drivers[name](query,{maxResults:limit})){const url=canonical(row?.url);if(url)rows.push({...row,url,retrieval:{...row.retrieval,searchProvider:name}});}}catch{errors.push(name);}
  if(!rows.length&&errors.length)throw new Error('配置的搜索服务本次均未返回来源：'+errors.join('、')+'。'+details.join('；'));
  const unique=new Map();for(const row of rows){const old=unique.get(row.url);if(!old||String(row.raw_content||row.content||'').length>String(old.raw_content||old.content||'').length)unique.set(row.url,row);}
  const groups=new Map();for(const row of unique.values()){const key=sourceSite(row.url);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  const output=[];while(output.length<limit&&[...groups.values()].some(g=>g.length))for(const group of groups.values())if(group.length&&output.length<limit)output.push(group.shift());
  return output;
}
