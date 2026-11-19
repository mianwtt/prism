import {locateSourceText} from './source-passages.mjs';
import {convertQuantity} from './decision-evidence.mjs';

export const catalogRequestKey=request=>request.platform+':'+String(request.keywords??request.location).trim().replace(/\s+/g,' ').toLowerCase();

// Prune unsolicited dimensions before type validation. Otherwise an invalid
// extra field can reject a valid task before the existing priority filter runs.
export function pruneUnrequestedDimensions(plan,request){
  const fields=plan.schema?.fields;if(!Array.isArray(fields))return plan;
  const anchored=(Array.isArray(plan.constraints)?plan.constraints:[]).filter(c=>typeof c.quote==='string'&&request.includes(c.quote)&&fields.some(f=>f.key===c.field));
  if(!anchored.length)return plan;
  const keys=new Set(anchored.map(c=>c.field));
  const kept=fields.filter(f=>keys.has(f.key)||[String(f.label||'').replace(/\s*[(（].*?[)）]/g,''),f.conditionLabel,...(f.aliases||[])].filter(t=>typeof t==='string'&&t.length>=2).some(t=>request.toLowerCase().includes(t.toLowerCase()))||typeof f.priorityQuote==='string'&&f.priorityQuote.trim().length>1&&request.includes(f.priorityQuote));
  if(!kept.length||kept.length===fields.length)return plan;
  const removed=new Set(fields.filter(f=>!kept.includes(f)).map(f=>f.key)),first=[...anchored].sort((a,b)=>request.indexOf(a.quote)-request.indexOf(b.quote))[0];
  return {...plan,schema:{...plan.schema,fields:kept,layout:{...plan.schema.layout,primaryField:kept.some(f=>f.key===plan.schema.layout?.primaryField)?plan.schema.layout.primaryField:first.field,summaryFields:plan.schema.layout?.summaryFields?.filter(k=>!removed.has(k))}},
    constraints:(plan.constraints||[]).filter(c=>!removed.has(c.field)),whatifs:(plan.whatifs||[]).map(s=>({...s,changes:(s.changes||[]).filter(c=>!removed.has(c.field))})).filter(s=>s.changes.length)};
}

// Model formatting is not a change to the request. Resolve quotes back to the
// exact user span and derive only an unambiguous quantity in that span.
export function repairPlanConstraints(plan,request){
  const repairs=[];
  const constraints=(Array.isArray(plan.constraints)?plan.constraints:[]).map(c=>{
    const quote=locateSourceText(request,c?.quote);if(!quote)return c;
    const next={...c,quote},field=plan.schema?.fields?.find(f=>f.key===c.field);
    if(quote!==c.quote)repairs.push({field:c.field,kind:'quote-whitespace'});
    if(field&&(field.type||'number')==='number'&&Number.isFinite(c.value)){
      const values=[...quote.matchAll(/(?<![-\d.])(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g\b|克|分钟|min\b|小时|h\b|GB\b|TB\b|万元|万|元|CNY\b|㎡|m²|m2\b|平方米|平米)/gi)]
        .map(m=>convertQuantity(Number(m[1]),m[2],field.unit)).filter(v=>v!==null);
      const unique=[...new Set(values)];if(unique.length===1&&unique[0]!==c.value){next.value=unique[0];repairs.push({field:c.field,kind:'quoted-quantity',modelValue:c.value,value:next.value});}
    }
    return next;
  });
  return {...plan,constraints,planRepairs:repairs};
}

export function normalizeCatalogRequests(proposals,platforms=[]){
  const result=[],seen=new Set();
  for(const r of Array.isArray(proposals)?proposals:[]){
    const platform=platforms.find(p=>p.platform===r?.platform);if(!platform)continue;
    const key=platform.input||'keywords',raw=r[key]??(key==='location'?r.city:undefined);
    if(typeof raw!=='string'||!raw.trim()||raw.length>40)continue;
    const value=raw.trim(),identity=platform.platform+':'+value.toLowerCase();if(seen.has(identity))continue;seen.add(identity);
    result.push({platform:platform.platform,[key]:value});if(result.length===2)break;
  }
  return result;
}
