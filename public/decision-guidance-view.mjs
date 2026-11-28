import {decisionGuidance} from '/decision-guidance.mjs';
import {formatDecisionValue} from '/decision-schema.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function decisionGuidanceView(space,selected,{busy=false}={}){
  const guidance=decisionGuidance(space,selected);
  const quote=change=>{
    const source=space.sources.find(source=>source.id===change.sourceId);
    const link=/^https?:\/\//i.test(source?.url||'')?`<a href="${esc(source.url)}" target="_blank" rel="noreferrer">打开原文 ↗</a>`:'';
    return `<p>${esc(change.candidateName)} · ${esc(change.label)} ${link}</p><blockquote>${esc(change.quote)}</blockquote>`;
  };
  return `<div class="decision-exploration"><header><span>沿当前分支继续</span><h3>下一步，值得试什么？</h3><p>依据这条路径中的 ${guidance.candidateCount} 个候选，找出关键缺口与可验证的条件变化。</p></header>
    <section class="exploration-questions">${guidance.investigations.length?'<h4>先核对影响选择的疑点</h4>':''}${guidance.investigations.map(task=>`<article class="exploration-question"><span class="exploration-kicker">${task.hardConditions?'涉及硬条件':'可能影响排序'}</span><h5>${esc(task.candidateName)}</h5><p class="exploration-fields">${task.fields.map(f=>esc(f.label)).join(' · ')}</p><p>${esc(task.reason)}</p><button type="button" data-investigate-decision="${esc(task.id)}" data-investigate-candidate="${esc(task.candidateId)}" data-investigate-kind="${task.kind}" ${busy?'disabled':''}>${space.mode==='demo'?'查看演示依据':task.kind==='review'?'查看并确认引用':busy?'正在核对依据…':'核对这些依据'} <span aria-hidden="true">↗</span></button></article>`).join('')||'<p class="exploration-ready">当前没有需要优先补查的字段。可以直接探索条件，或继续查看资料。</p>'}</section>
    <section class="exploration-hypotheses"><h4>试一条有依据的假设</h4>${guidance.suggestions.map(proposal=>`<article class="exploration-hypothesis"><span class="exploration-kicker">${proposal.changes.length>1?'同时改变 '+proposal.changes.length+' 项条件':proposal.kind==='relax'?'看看新增的选择':'看看更严格的取舍'}</span><h5>${proposal.changes.map(change=>{const field=space.schema.fields.find(f=>f.key===change.field);return esc(change.label)+' '+esc(formatDecisionValue(change.from,field))+' → '+esc(formatDecisionValue(change.value,field));}).join('<br>')}</h5><div class="exploration-count"><b>${proposal.beforeCount} → ${proposal.afterCount}</b><span>个符合条件</span></div><p>${proposal.entered.length?'可进入：'+esc(proposal.entered.map(c=>c.name).slice(0,2).join('、')):'会退出：'+esc(proposal.exited.map(c=>c.name).slice(0,2).join('、'))}</p><details><summary>这个阈值从哪里来？</summary>${proposal.changes.map(quote).join('')}</details><button type="button" data-guidance-suggestion="${esc(proposal.id)}" ${busy?'disabled':''}>在画布新建这条假设 <span aria-hidden="true">↗</span></button></article>`).join('')||'<p class="exploration-empty">当前资料中还没有找到能改变结果的一至两项条件调整。可以先补齐依据或继续研究。</p>'}</section>
    <footer>${space.mode==='demo'?'当前为虚构演示；不发起真实补查。':'阈值来自本分支可核对的保存事实，覆盖范围仍是当前候选。'} 新假设保留父分支，不改写你的原始要求。</footer></div>`;
}
