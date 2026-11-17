import { randomUUID } from 'node:crypto';
import {suningMobileUrl} from './merchant-browser.mjs';
const clean = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const key = value => clean(value).replace(/[\s._-]/g, '');
export function validatedIdentity(raw, candidateName, source) {
  if (!raw || !['product-model','listing','other'].includes(raw.namespace) || typeof raw.value !== 'string' || raw.value.length > 100 || typeof raw.quote !== 'string' || raw.quote.length > 500) return null;
  const value = raw.value.trim(), quote = clean(raw.quote);
  const explicit=/sku|mpn|part\s*(?:number|no)|完整型号|具体型号|产品编号|房源编号|listing\s*id|标识/i.test(quote);
  const detailedModel=raw.namespace==='product-model'&&value.length>=10&&/型号|model/i.test(quote)&&/[a-z]/i.test(value);
  if (value.length < 6 || raw.namespace==='product-model'&&!/[a-z]/i.test(value) || !/\d{3}/.test(value) || /^(?:\d+(?:gb|tb|kg|mhz|ghz))+$/i.test(key(value)) || !(explicit||detailedModel) || !key(quote).includes(key(value)) || !clean(source.text).includes(quote) || !(quote.includes(clean(candidateName))||clean(source.title).includes(clean(candidateName)))) return null;
  // Global product codes may reconcile across hosts. Listing/service IDs remain host-scoped.
  const host = (() => { try { return new URL(source.url).hostname.replace(/^www\./,''); } catch { return source.id; } })();
  return {namespace:raw.namespace,value,quote:raw.quote,sourceId:source.id,scope:raw.namespace==='product-model'?'global':host};
}
export function candidateIdentityKey(candidate, sources) {
  if (candidate.identity) return `identity:${candidate.identity.namespace}:${candidate.identity.scope}:${key(candidate.identity.value)}`;
  const source = sources.find(s => s.id === candidate.sourceId);
  const productUrl=suningMobileUrl(source?.url);if(productUrl)return 'product-page:'+productUrl;
  let url = source?.url || source?.id || '';
  try { const parsed = new URL(url); parsed.hash=''; for(const name of [...parsed.searchParams.keys()])if(/^(?:utm_|spm$|from$)/.test(name))parsed.searchParams.delete(name); url=parsed.href; } catch {}
  return `page:${url}:${clean(candidate.name)}`;
}
const observations = fact => [fact,...(fact?.evidence||[]),...(fact?.conflictingEvidence||[])].filter(o=>o&&o.value!==null&&o.value!==undefined&&o.sourceId&&o.quote);
export function combineFacts(a, b) {
  const all = [...observations(a),...observations(b)], seen=new Set();
  const evidence=all.filter(o=>{const id=JSON.stringify([o.value,o.sourceId,o.quote]);if(seen.has(id))return false;seen.add(id);return true;}).map(({value,sourceId,quote})=>({value,sourceId,quote,status:'cited'}));
  if (!evidence.length) return a || b || {value:null,status:'unknown',sourceId:null,quote:''};
  if (new Set(evidence.map(o=>JSON.stringify(o.value))).size > 1) return {value:null,status:'unknown',sourceId:null,quote:'',evidence,conflictingEvidence:evidence,reviewReason:'同一标识的多来源数值不一致，请核对配置、时间或口径'};
  return {...evidence[0],evidence};
}
export function reconcileCandidates(candidates, sources, schema) {
  const groups = new Map(), warnings=[];
  for(const candidate of candidates){
    const group=candidateIdentityKey(candidate,sources), previous=groups.get(group);
    if(!previous){groups.set(group,structuredClone(candidate));continue;}
    for(const field of schema.fields)previous.facts[field.key]=combineFacts(previous.facts[field.key],candidate.facts[field.key]);
    previous.sourceIds=[...new Set([...(previous.sourceIds||[previous.sourceId]),...(candidate.sourceIds||[candidate.sourceId])])];
    previous.identityEvidence=[...(previous.identityEvidence||[previous.identity].filter(Boolean)),...(candidate.identityEvidence||[candidate.identity].filter(Boolean))];
    if(candidate.name!==previous.name)previous.aliases=[...new Set([...(previous.aliases||[]),candidate.name])];
  }
  const result=[...groups.values()];
  for(const c of result){
    const conflicts=schema.fields.filter(f=>c.facts[f.key]?.conflictingEvidence?.length);
    if(conflicts.length)warnings.push(`${c.name}：${conflicts.map(f=>f.label).join('、')}存在来源分歧，未自动采用任一数值。`);
  }
  return {candidates:result,warnings};
}
// Produce a branch-local combined observation; callers preserve the original candidate and baseline.
export function combineCandidate(previous, incoming, sources, schema) {
  const result=reconcileCandidates([previous,incoming],sources,schema).candidates[0];
  return {...result,id:'option-'+randomUUID().slice(0,12)};
}
