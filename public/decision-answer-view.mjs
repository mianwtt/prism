import {buildDecisionAnswer,decisionBasisKey} from '/decision-answer.mjs';
import {formatDecisionValue} from '/decision-schema.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Workspace versions are immutable and condition edits replace scenario objects.
// Multiple turns on the same path share verification work during a render.
const contexts=new WeakMap();
function contextFor(space,scenario){
  let scenarios=contexts.get(space);if(!scenarios){scenarios=new WeakMap();contexts.set(space,scenarios);}
  let context=scenarios.get(scenario);if(!context){context={key:decisionBasisKey(space,scenario),answers:new WeakMap()};scenarios.set(scenario,context);}return context;
}

export function decisionAnswerView(message,space,scenarios,active){
  const saved=message.decisionAnswer,scenario=scenarios.find(s=>s.id===saved?.scenarioId);
  if(!saved||!scenario)return '';
  const context=contextFor(space,scenario);
  if(saved.basisKey!==context.key)return `<div class="answer-stale"><p>这份分析对应当时的条件、资料与任务背景；当前情况已变化，可重新比较。</p><details><summary>查看当时回答</summary><p>${esc(message.content)}</p></details></div>`;
  let answer=context.answers.get(saved);if(!answer){answer=buildDecisionAnswer(saved,space,scenario);context.answers.set(saved,answer);}
  return `<p class="answer-summary">${esc(answer.summary)}</p><section class="decision-answer" aria-label="有依据的方案分析"><header><span>${space.mode==='demo'?'演示资料比较':'当前分支分析'}</span><small>${scenario.id===active?'与当前路径对应':'保留原路径条件'}</small></header>
    ${answer.recommendations.map((item,index)=>{
      const candidate=space.candidates.find(c=>c.id===item.candidateId);
      return `<article class="answer-option"><div class="answer-option-heading"><span>${String(index+1).padStart(2,'0')}</span><strong>${esc(candidate.name)}</strong></div><p>${esc(item.reason)}</p><div class="answer-facts">${item.fields.map(key=>{const field=space.schema.fields.find(f=>f.key===key);return `<span>${esc(field.label)} <b>${esc(formatDecisionValue(candidate.facts[key].value,field))}</b></span>`;}).join('')}</div><details><summary>查看这条建议的依据</summary>${item.fields.map(key=>{const field=space.schema.fields.find(f=>f.key===key),fact=candidate.facts[key],source=space.sources.find(s=>s.id===fact.sourceId);return `<div class="answer-citation"><b>${esc(field.label)}</b><blockquote>${esc(fact.quote)}</blockquote>${/^https?:\/\//i.test(source?.url||'')?`<a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)} ↗</a>`:'<small>虚构演示依据</small>'}</div>`;}).join('')}</details><button type="button" data-answer-candidate="${esc(candidate.id)}" data-answer-scenario="${esc(scenario.id)}">在画布定位方案 <span aria-hidden="true">↗</span></button></article>`;
    }).join('')}
    ${answer.gaps.length?`<div class="answer-gaps"><strong>决定前，先补齐这些信息</strong>${answer.gaps.map(g=>`<p>${esc(space.candidates.find(c=>c.id===g.candidateId).name)} · ${g.fields.map(key=>esc(space.schema.fields.find(f=>f.key===key).label)).join('、')}</p>`).join('')}<button type="button" data-open-guidance>查看下一步核对建议 ↗</button></div>`:''}
    <footer>建议依据已保存资料；最终选择由你确认。</footer></section>`;
}
