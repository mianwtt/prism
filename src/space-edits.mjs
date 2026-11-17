import { randomUUID } from "node:crypto";
import {editGeneralSpace} from './general-space.mjs';
import {adaptLegacyDecision} from './legacy-decision.mjs';
import {diffDecisionSpaces} from './decision-workflow.mjs';
import { resolveScenarioScopes } from "./scenarios.mjs";
import { quoteContainsNumber } from "./evidence.mjs";
import {
  dimensions,
  validateSettings,
  evaluate,
  comparison,
} from "./engine.mjs";
export function editSpace(previous, input) {
  if(previous.schema)return editGeneralSpace(previous,input);
  const next = structuredClone(previous);
  next.settings = validateSettings(input.settings ?? next.settings);
  if (input.scenarios !== undefined) next.scenarios = resolveScenarioScopes(previous,input.scenarios);
  if(input.scenarios!==undefined){
    next.baselineSettings??=structuredClone(previous.settings);
    next.baselineCandidateIds??=previous.candidates.map(c=>c.id);
    if(input.activeScenarioId && next.scenarios.some(s=>s.id===input.activeScenarioId))next.activeScenarioId=input.activeScenarioId;
    if(next.activeScenarioId==='scenario-baseline')next.settings=structuredClone(next.baselineSettings);
  }
  if (
    !Array.isArray(input.candidateEdits ?? []) ||
    (input.candidateEdits ?? []).length > 24
  )
    throw new Error("无效的方案修改");
  for (const edit of input.candidateEdits ?? []) {
    if (edit.action === "add") {
      if (next.candidates.length >= 12)
        throw new Error("最多保留 12 个候选方案");
      const name = validateName(edit.name);
      next.candidates.push({
        id: "manual-" + randomUUID(),
        name,
        tag: "手动添加 · 参数待录入",
        enabled: true,
        facts: Object.fromEntries(
          Object.keys(dimensions).map((k) => [
            k,
            { value: null, status: "unknown", sourceId: null, quote: "" },
          ]),
        ),
      });
      const active=next.scenarios?.find(s=>s.id===next.activeScenarioId)||next.scenarios?.[0];
      if(active&&next.baselineCandidateIds)active.candidateIds=[...new Set([...(active.candidateIds||next.baselineCandidateIds),next.candidates.at(-1).id])];
      continue;
    }
    const candidate = next.candidates.find((c) => c.id === edit.candidateId);
    if (!candidate) throw new Error("候选方案不存在");
    if (edit.action === "rename") {
      candidate.originalName ??= candidate.name;
      candidate.name = validateName(edit.name);
    } else if (edit.action === "toggle" && typeof edit.enabled === "boolean")
      candidate.enabled = edit.enabled;
    else throw new Error("无效的方案修改操作");
  }
  if (!Array.isArray(input.reviews ?? []) || (input.reviews ?? []).length > 48)
    throw new Error("无效的参数修改");
  for (const review of input.reviews ?? []) {
    const candidate = next.candidates.find((c) => c.id === review.candidateId);
    if (
      !candidate ||
      !Object.hasOwn(dimensions, review.key) ||
      !Number.isFinite(review.value) ||
      review.value <= 0 ||
      review.value > 1000000
    )
      throw new Error("无效的参数修改");
    const old = candidate.facts[review.key];
    if (typeof review.quote === "string" && review.quote.trim()) {
      const quote = review.quote.trim(),
        source = next.sources.find(
          (s) => s.id === (review.sourceId || old.sourceId),
        );
      const normalized = (s) => s.replace(/\s+/g, " ").trim();
      if (
        !source ||
        quote.length < 3 ||
        quote.length > 2000 ||
        !normalized(source.text).includes(normalized(quote)) ||
        !quoteContainsNumber(quote, review.value)
      )
        throw new Error(
          "新引文必须来自当前保存的来源，并包含该数值；请检查原文或保存为个人假设",
        );
      candidate.facts[review.key] = {
        ...old,
        value: review.value,
        quote,
        sourceId: source.id,
        status: "confirmed",
        confirmation: "user-reviewed",
        reviewedAt: new Date().toISOString(),
      };
      delete candidate.facts[review.key].reviewReason;
      continue;
    }
    const unchanged = old.value === review.value && old.sourceId && old.quote;
    candidate.facts[review.key] = {
      ...old,
      value: review.value,
      status: "confirmed",
      confirmation: unchanged ? "user-reviewed" : "user-assumption",
      reviewedAt: new Date().toISOString(),
      ...(unchanged
        ? {}
        : {
            original: old.original || {
              value: old.value,
              sourceId: old.sourceId,
              quote: old.quote,
            },
            sourceId: null,
            quote: "",
          }),
    };
    delete candidate.facts[review.key].reviewReason;
  }
  if(input.decision!==undefined){
    const decision=input.decision;
    if(!decision||typeof decision!=='object'||Array.isArray(decision)||typeof decision.rationale!=='string'||decision.rationale.length>1500)throw new Error('决策说明需要为 1500 字以内的文本');
    const candidate=decision.candidateId?next.candidates.find(c=>c.id===decision.candidateId):null;
    if(decision.candidateId!==null&&(!candidate||typeof decision.candidateId!=='string'))throw new Error('请选择当前空间中的方案');
    const rationale=decision.rationale.trim();
    if(!candidate&&!rationale)throw new Error('请选择一个方案，或写下继续考虑的原因');
    next.decision={candidateId:candidate?.id||null,candidateName:candidate?.name||null,rationale,recordedAt:new Date().toISOString()};
  }
  return next;
}
function validateName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 150)
    throw new Error("方案名称需要 1–150 字");
  return value.trim();
}
export function diffSpaces(before, after) {
  if(after.schema&&!before.schema)before=adaptLegacyDecision(before);
  if(after.schema)return diffDecisionSpaces(before,after);
  const settingsChanges = [];
  for (const key of ["budget", "minMemory", "maxWeight", "calculationMode"])
    if ((before.settings[key] ?? (key === "calculationMode" ? "reviewed" : undefined)) !== (after.settings[key] ?? (key === "calculationMode" ? "reviewed" : undefined)))
      settingsChanges.push({
        field: key,
        before: before.settings[key],
        after: after.settings[key],
      });
  for (const key of Object.keys(dimensions))
    if (before.settings.weights[key] !== after.settings.weights[key])
      settingsChanges.push({
        field: "weights." + key,
        before: before.settings.weights[key],
        after: after.settings.weights[key],
      });
  const candidateChanges = [],
    factChanges = [],
    sourceChanges = [];
  for (const candidate of after.candidates) {
    const old = before.candidates.find((c) => c.id === candidate.id);
    if (!old) {
      candidateChanges.push({
        id: candidate.id,
        name: candidate.name,
        type: "added",
      });
      continue;
    }
    if (old.name !== candidate.name)
      candidateChanges.push({
        id: candidate.id,
        type: "renamed",
        before: old.name,
        after: candidate.name,
      });
    if ((old.enabled !== false) !== (candidate.enabled !== false))
      candidateChanges.push({
        id: candidate.id,
        name: candidate.name,
        type: candidate.enabled === false ? "disabled" : "enabled",
      });
    for (const key of Object.keys(dimensions)) {
      const a = old.facts[key],
        b = candidate.facts[key];
      if (
        a.value !== b.value ||
        a.status !== b.status ||
        a.confirmation !== b.confirmation
      )
        factChanges.push({
          candidateId: candidate.id,
          name: candidate.name,
          field: key,
          before: {
            value: a.value,
            status: a.status,
            confirmation: a.confirmation,
          },
          after: {
            value: b.value,
            status: b.status,
            confirmation: b.confirmation,
          },
        });
    }
  }
  for (const source of after.sources) {
    const old = before.sources.find((s) => s.id === source.id);
    if (old && (old.text !== source.text || source.refreshStatus === "failed"))
      sourceChanges.push({
        id: source.id,
        title: source.title,
        status: source.refreshStatus === "failed" ? "unavailable" : "changed",
      });
  }
  return {
    beforeId: before.id,
    afterId: after.id,
    settingsChanges,
    candidateChanges,
    factChanges,
    sourceChanges,
    decisionChange:JSON.stringify(before.decision||null)!==JSON.stringify(after.decision||null)?{before:before.decision||null,after:after.decision||null}:null,
    scenarioChanges: [
      ...(after.scenarios || []).flatMap(s => {
        const old = before.scenarios?.find(b => b.id === s.id);
        return !old ? [{ id: s.id, name: s.name, type: "added" }] : JSON.stringify(old) !== JSON.stringify(s) ? [{ id: s.id, name: s.name, type: "changed" }] : [];
      }),
      ...(before.scenarios || []).filter(s => !after.scenarios?.some(a => a.id === s.id)).map(s => ({ id: s.id, name: s.name, type: "removed" })),
    ],
    ranking: comparison(
      evaluate(before.candidates, before.settings),
      evaluate(after.candidates, after.settings),
    ),
  };
}
