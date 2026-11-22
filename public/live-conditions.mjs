import {formatDecisionValue} from '/decision-schema.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function conditionValues(field,value,baseline,hints){
  if(field.type==='boolean')return [true,false,null];
  if(field.type==='enum')return [...field.options,null];
  if(hints){
    const values=[...new Set([...hints,value,baseline].filter(v=>Number.isFinite(v)&&v>=0))];
    const nearest=values.sort((a,b)=>Math.abs(a-(value??baseline??0))-Math.abs(b-(value??baseline??0))).slice(0,7);
    return [...new Set([...nearest,value,baseline].filter(v=>Number.isFinite(v)&&v>=0))].sort((a,b)=>a-b);
  }
  const step=field.step||1,center=value??baseline??step*4;
  return [...new Set([center-2*step,center-step,center,center+step,center+2*step,baseline].filter(v=>Number.isFinite(v)&&v>0).map(v=>Number(v.toFixed(6))))].sort((a,b)=>a-b);
}
export function conditionButtons(field,scenario,baseline,hints){
  const value=scenario.settings.limits[field.key];
  return conditionValues(field,value,baseline,hints).map(v=>`<button type="button" class="condition-preset ${v===value?'selected':''}" aria-pressed="${v===value}" data-live-condition="${esc(field.key)}" data-live-value="${esc(JSON.stringify(v))}" data-live-scenario="${esc(scenario.id)}">${v===null?'不限':esc((field.type||'number')==='number'?Number(v).toLocaleString('zh-CN'):formatDecisionValue(v,field))}</button>`).join('');
}
export function liveControls(schema,scenario,baseline,context){
  return `<div class="live-condition-grid" id="u-conditions">${schema.fields.filter(f=>scenario.settings.weights[f.key]>0||scenario.settings.limits[f.key]!==null||baseline.settings.limits[f.key]!==null).map(f=>{
    const hints=context?[...(context.candidates||[]).filter(c=>c.enabled!==false).map(c=>c.facts[f.key]).filter(fact=>['cited','confirmed','example'].includes(fact?.status)).map(fact=>fact.value),...(context.scenarios||[]).map(s=>s.settings.limits[f.key])]:undefined;
    const value=scenario.settings.limits[f.key],base=baseline.settings.limits[f.key],numeric=(f.type||'number')==='number',values=conditionValues(f,value,base,hints).filter(Number.isFinite);
    const min=numeric?Math.max(0,Math.min(...values,base??Infinity)-(f.step||1)):0,max=numeric?Math.max(...values,0)+2*(f.step||1):0;
    const lower=Number.isFinite(min)?min:0;
    return `<fieldset class="live-condition"><legend>${esc(f.conditionLabel||f.label)}${numeric?(f.direction===1?'至少':'上限'):''}</legend>${numeric?`<div class="live-condition-number"><input type="number" name="${esc(f.key)}" data-live-input="${esc(f.key)}" aria-label="${esc(f.conditionLabel||f.label)}条件" min="0" max="1000000000" step="any" placeholder="不限" value="${value??''}"><span>${esc(f.unit)}</span></div><input type="range" data-live-range="${esc(f.key)}" aria-label="拖动调整${esc(f.conditionLabel||f.label)}" min="${lower}" max="${max}" step="${f.step<1?f.step:1}" value="${value??lower}">`:''}<div class="condition-presets">${conditionButtons(f,scenario,base,hints)}</div></fieldset>`;
  }).join('')}</div>`;
}
