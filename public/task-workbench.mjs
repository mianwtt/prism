import {proposalView} from '/decision-proposal-view.mjs';
import {evaluateDecision, formatDecisionValue, summarizeConditions} from '/decision-schema.mjs';
import {evidenceRows} from '/decision-workflow.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${{
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  source:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  branch:'<path d="M4 12h5c5 0 5-7 11-7M9 12c5 0 5 7 11 7"/><circle cx="3" cy="12" r="2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  note:'<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
}[name] || ''}</svg>`;

export function taskSummary(space, selected) {
  const pool = space.candidates.filter(c => (selected.candidateIds || space.candidates.map(item => item.id)).includes(c.id));
  const ranked = evaluateDecision(pool, selected.settings, space.schema);
  const rows = pool.flatMap(candidate => evidenceRows(space, candidate).map(row => ({...row, candidateId:candidate.id, candidateName:candidate.name})));
  const cited = rows.filter(row => ['cited','confirmed'].includes(row.status)).length;
  const gaps = rows.filter(row => (selected.settings.limits[row.field.key]!==null||selected.settings.weights[row.field.key]>0)&&['missing','unsupported','conflict','unselected'].includes(row.status));
  const sourceIds = new Set(rows.flatMap(row => row.observations.map(item => item.sourceId)));
  const sources = space.sources.filter(source => sourceIds.has(source.id));
  const eligible = ranked.filter(row => row.status === 'eligible');
  const unresolved = ranked.filter(row => row.status === 'unresolved');
  const branches = (space.scenarios || []).filter(scenario => scenario.id !== 'scenario-baseline').length;
  const saved = Boolean(space.decision);
  const analysis = space.analysis?.settingsKey === JSON.stringify(selected.settings) && (!space.analysis.scenarioId || space.analysis.scenarioId === selected.id) ? space.analysis : null;
  const phase = saved ? 3 : !pool.length ? 0 : !eligible.length || gaps.length ? 1 : 2;
  return {pool, ranked, rows, cited, gaps, sources, eligible, unresolved, branches, saved, analysis, phase};
}

export function taskStrip(space, selected, scenarios=[]) {
  const summary = taskSummary(space, selected);
  const parent = scenarios.find(scenario=>scenario.id===selected.parentScenarioId);
  const parentSummary = parent ? taskSummary(space,parent) : null;
  const entered = parentSummary ? summary.eligible.filter(row=>!parentSummary.eligible.some(before=>before.id===row.id)).length : 0;
  const exited = parentSummary ? parentSummary.eligible.filter(row=>!summary.eligible.some(after=>after.id===row.id)).length : 0;
  return `<div class="mission-strip"><span class="mission-status"><i></i>${space.mode === 'demo' ? '交互演示' : '方案选型'}</span><span>${summary.eligible.length} 个符合条件 · ${summary.gaps.length} 项待核对</span>${parentSummary ? `<span class="mission-branch-delta" title="与直接父分支比较，依据各自条件和候选范围计算">相较父分支：${entered} 个进入 · ${exited} 个退出</span>` : ''}<button type="button" data-u-pane="overview">查看当前建议书 ${icon('arrow')}</button></div>`;
}

export function taskOverview(space,scenarios,selected,options={}) {
  return proposalView(space,scenarios,selected,options);
}
