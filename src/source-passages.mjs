import {observationIssue,observationConversion} from './decision-evidence.mjs';
import {isMerchantProduct} from './source-types.mjs';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function locateSourceText(text,proposed){
  text=String(text||'');proposed=String(proposed||'');if(!proposed||proposed.length>1500)return null;
  if(text.includes(proposed))return proposed;
  const characters=[...proposed.replace(/\s/g,'')];
  if(characters.length<3)return null;
  return new RegExp(characters.map(escape).join('\\s{0,8}')).exec(text)?.[0]||null;
}
// Recover a passage only for a proposed value, on a concrete detail page. Never invent an amount.
export function recoverNumericPassage(field,fact,source){
  if((field.type||'number')!=='number'||!Number.isFinite(fact?.value)||source?.kind!=='page'||!isMerchantProduct(source))return null;
  if(/元|CNY|人民币/.test(field.unit))return source.publicPrice?.value===fact.value?{quote:source.publicPrice.quote}:null;
  const text=String(source.text||''),passages=[];
  for(const match of text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?\s*(?:kg|千克|公斤|g\b|GB\b|TB\b|分钟|小时|元|CNY\b)|[¥￥]\s*\d+(?:,\d{3})*(?:\.\d+)?/gi)){
    const start=text.lastIndexOf('\n',match.index)+1,next=text.indexOf('\n',match.index),end=next<0?text.length:next;
    const quote=text.slice(Math.max(start,match.index-60),Math.min(end,match.index+120)).trim();
    const observation={value:fact.value,quote};
    if(!observationIssue(field,observation,source))passages.push({quote,score:[field.label.replace(/\s*[(（].*?[)）]/g,''),field.conditionLabel,...(field.aliases||[])].filter(Boolean).filter(term=>quote.includes(term)).length,...(observationConversion(field,observation)?{conversion:observationConversion(field,observation)}:{})});
  }
  return passages.sort((a,b)=>b.score-a.score)[0]||null;
}
