import { dimensions, factIssue } from "./engine.mjs";
import {configurationIssue} from "./configuration.mjs";
import {isNewsSource} from './source-types.mjs';
const normalize = (s) => String(s).replace(/\s+/g, " ").trim();
function sourcePriceIssue(key,source){
  return key==='price'&&source&&(isNewsSource(source)||/launch/i.test(source.title||''))?'新闻或上市参考价，未证明当前在售报价':null;
}
export function quoteContainsNumber(quote, value) {
  return (quote.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) || []).some(
    (token) => Number(token.replaceAll(",", "")) === value,
  );
}
export function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function validateCandidates(raw, sources) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 6)
    throw new Error("模型必须返回 1–6 个候选方案");
  const warnings = [];
  const candidates = raw.map((c, index) => {
    if (typeof c.name !== "string" || !c.name.trim())
      throw new Error("候选方案缺少名称");
    const facts = {};
    for (const key of Object.keys(dimensions)) {
      const f = c.facts?.[key],
        source = sources.find((s) => s.id === f?.sourceId);
      const quote =
        typeof f?.quote === "string" ? f.quote.trim().slice(0, 2000) : "";
      const issue = sourcePriceIssue(key,source) || source&&configurationIssue(c.name,source.title) || factIssue(key, { ...f, status: "unreviewed", quote });
      const valid =
        Number.isFinite(f?.value) &&
        f.value > 0 &&
        source &&
        quote.length >= 3 &&
        quoteContainsNumber(quote, f.value) &&
        normalize(source.text).includes(normalize(quote)) && !issue;
      facts[key] = valid
        ? { value: f.value, sourceId: source.id, quote, status: "unreviewed",...(f.quoteRecovery?{quoteRecovery:f.quoteRecovery}:{}) }
        : { value: null, sourceId: null, quote: "", status: "unknown",
            ...(f ? { rejectedEvidence: { value: f.value ?? null, sourceId: source?.id ?? null, quote }, reviewReason: issue || "引文与来源不匹配" } : {}) };
      const observations = valid ? [structuredClone(facts[key])] : [];
      for (const item of (Array.isArray(f?.evidence) ? f.evidence : []).slice(0, 4)) {
        const linked = sources.find(s => s.id === item?.sourceId);
        const excerpt = typeof item?.quote === "string" ? item.quote.trim().slice(0, 2000) : "";
        if (linked && Number.isFinite(item.value) && item.value > 0 && excerpt.length >= 3 &&
          quoteContainsNumber(excerpt, item.value) && normalize(linked.text).includes(normalize(excerpt)) &&
          !factIssue(key, { ...item, quote: excerpt, status: "unreviewed" }) && !sourcePriceIssue(key,linked) && !configurationIssue(c.name,linked.title)) {
          if (!observations.some(o => o.sourceId === item.sourceId && o.value === item.value && o.quote === excerpt))
            observations.push({ value: item.value, sourceId: linked.id, quote: excerpt, status: "unreviewed",...(item.quoteRecovery?{quoteRecovery:item.quoteRecovery}:{}) });
        } else warnings.push(`${c.name}: ${dimensions[key].label}的附加引文未通过校验，未计入对照`);
      }
      if (observations.length) {
        const conflict = new Set(observations.map(o => o.value)).size > 1;
        facts[key] = conflict
          ? { value: null, status: "unknown", sourceId: null, quote: "", reviewReason: "多来源数值不一致，需核对配置、时间与测试条件", conflictingEvidence: observations, evidence: observations }
          : { ...observations[0], evidence: observations };
        if (conflict) warnings.push(`${c.name}: ${dimensions[key].label}存在多来源数值冲突，未自动采用任一数值`);
      }
      if (!valid && !observations.length)
        warnings.push(
          `${c.name}: ${dimensions[key].label} — ${issue || "引文与来源不匹配"}`,
        );
    }
    return {
      id: "candidate-" + (index + 1),
      name: c.name.replace(/\s*[(（][^()（）]*[)）]/g, "").trim().slice(0, 150) || c.name.trim().slice(0, 150),
      proposedName: c.name.trim().slice(0, 150),
      tag: "检索候选 · 型号配置待核实",
      facts,
    };
  });
  const unique = [];
  for (const candidate of candidates) {
    const prior = unique.find(c => c.proposedName.toLowerCase() === candidate.proposedName.toLowerCase());
    if (!prior) { unique.push(candidate); continue; }
    warnings.push(`${candidate.proposedName}: 重复候选已合并；不同来源报价不会作为不同产品`);
    prior.alternateExtractions ??= [];
    prior.alternateExtractions.push(candidate);
    for (const key of Object.keys(dimensions)) {
      const a = prior.facts[key], b = candidate.facts[key];
      if (a.conflictingEvidence) {
        if (b.value !== null) a.conflictingEvidence.push(b);
      } else if (a.value !== null && b.value !== null && a.value !== b.value) {
        prior.facts[key] = { value: null, status: "unknown", sourceId: null, quote: "",
          reviewReason: "重复候选的来源数值冲突，需核对配置或报价时间", conflictingEvidence: [a, b] };
      } else if (a.value === null && b.value !== null) prior.facts[key] = b;
      const linked = [a, ...(a.evidence || []), b, ...(b.evidence || [])].filter(item => item.value !== null && item.sourceId && item.quote);
      prior.facts[key].evidence = linked.filter((item, index) => linked.findIndex(other => other.sourceId === item.sourceId && other.value === item.value && other.quote === item.quote) === index)
        .map(({ value, sourceId, quote, status }) => ({ value, sourceId, quote, status }));
    }
  }
  return { candidates: unique, warnings };
}
