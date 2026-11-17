import {formatDecisionValue} from '/decision-schema.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function conditionValues(field,value,baseline){
  if(field.type==='boolean')return [true,false,null];
  if(field.type==='enum')return [...field.options,null];
  const step=field.step||1,center=value??baseline??step*4;
  return [...new Set([center-2*step,center-step,center,center+step,center+2*step,baseline].filter(v=>Number.isFinite(v)&&v>0).map(v=>Number(v.toFixed(6))))].sort((a,b)=>a-b);
}
export function conditionButtons(field,scenario,baseline){
  const value=scenario.settings.limits[field.key];
  return conditionValues(field,value,baseline).map(v=>`<button type="button" class="condition-preset ${v===value?'selected':''}" aria-pressed="${v===value}" data-live-condition="${esc(field.key)}" data-live-value="${esc(JSON.stringify(v))}" data-live-scenario="${esc(scenario.id)}">${v===null?'不限':esc((field.type||'number')==='number'?Number(v).toLocaleString('zh-CN'):formatDecisionValue(v,field))}</button>`).join('');
}
export function liveControls(schema,scenario,baseline){
  return `<div class="live-condition-grid" id="u-conditions">${schema.fields.filter(f=>scenario.settings.weights[f.key]>0||scenario.settings.limits[f.key]!==null).map(f=>{
    const value=scenario.settings.limits[f.key],base=baseline.settings.limits[f.key],numeric=(f.type||'number')==='number',values=conditionValues(f,value,base).filter(Number.isFinite);
    const min=numeric?Math.max(0,Math.min(...values)-(f.step||1)):0,max=numeric?Math.max(...values)+(f.step||1):0;
    return `<fieldset class="live-condition"><legend>${esc(f.conditionLabel||f.label)}${numeric?(f.direction===1?'至少':'上限'):''}</legend>${numeric?`<div class="live-condition-number"><input type="number" name="${esc(f.key)}" data-live-input="${esc(f.key)}" aria-label="${esc(f.conditionLabel||f.label)}条件" min="0" max="1000000000" step="any" placeholder="不限" value="${value??''}"><span>${esc(f.unit)}</span></div><input type="range" data-live-range="${esc(f.key)}" aria-label="拖动调整${esc(f.conditionLabel||f.label)}" min="${min}" max="${max}" step="${f.step<1?f.step:1}" value="${value??min}">`:''}<div class="condition-presets">${conditionButtons(f,scenario,base)}</div></fieldset>`;
  }).join('')}</div>`;
}
