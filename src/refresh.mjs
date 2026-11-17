const normalize = (s) => s.replace(/\s+/g, " ").trim();
import { enrichCandidateMedia } from "./media.mjs";
export async function refreshSpace(
  previous,
  io,
  onProgress = () => {},
  { snapshot = null, onCheckpoint = () => {} } = {},
) {
  if (previous.mode === "demo")
    throw new Error("演示资料是固定数据，无需联网刷新");
  if (typeof io.fetchSource !== "function")
    throw new Error("当前搜索服务不支持资料刷新");
  const next = structuredClone(snapshot || previous),
    observations = snapshot
      ? structuredClone(snapshot.refresh?.observations || [])
      : [];
  const finished = new Set(observations.map((o) => o.sourceId));
  const available = next.sources.filter((s) => s.url);
  if (!available.length) throw new Error("没有可刷新的网页来源");
  for (const source of available.slice(0, 24)) {
    if (finished.has(source.id)) continue;
    onProgress({
      type: "refresh",
      node: "refresh",
      message: "正在重新读取：" + source.title,
      at: new Date().toISOString(),
    });
    let text,
      failed = false;
    try {
      text = await io.fetchSource(source.url);
      if (typeof text !== "string" || !text.trim()) throw new Error("empty");
      text = text.slice(0, 16000);
    } catch {
      failed = true;
    }
    const changed = !failed && normalize(source.text) !== normalize(text);
    source.lastCheckedAt = new Date().toISOString();
    source.refreshStatus = failed
      ? "failed"
      : changed
        ? "changed"
        : "unchanged";
    if (changed) {
      source.text = text;
      source.retrievedAt = source.lastCheckedAt;
      source.kind = "page";
    }
    observations.push({
      sourceId: source.id,
      title: source.title,
      status: source.refreshStatus,
    });
    if (changed || failed) {
      for (const candidate of next.candidates)
        for (const fact of Object.values(candidate.facts)) {
          if (
            (fact.sourceId !== source.id && !(fact.evidence || []).some(e => e.sourceId === source.id)) ||
            fact.confirmation === "user-assumption"
          )
            continue;
          fact.previousObservation = {
            value: fact.value,
            quote: fact.quote,
            sourceId: fact.sourceId,
            affectedSourceId: source.id,
            versionId: previous.id,
          };
          fact.status = fact.value === null ? "unknown" : "unreviewed";
          delete fact.confirmation;
          fact.reviewReason = failed
            ? "无法刷新来源，已撤销确认，保留旧快照"
            : "来源快照已变化，需要重新确认";
          for (const item of fact.evidence || []) {
            if (item.sourceId === source.id) item.reviewReason = fact.reviewReason;
          }
          if (
            changed &&
            fact.sourceId === source.id &&
            fact.quote &&
            !normalize(source.text).includes(normalize(fact.quote))
          ) {
            fact.value = null;
            fact.quote = "";
            fact.status = "unknown";
          }
        }
    }
    next.refresh = {
      at: new Date().toISOString(),
      observations: [...observations],
    };
    await onCheckpoint(next);
  }
  next.refresh = { at: new Date().toISOString(), observations };
  await enrichCandidateMedia(next.candidates, next.sources, io, next.warnings || (next.warnings = []));
  next.trace = [
    ...(next.trace || []),
    {
      type: "refresh",
      node: "refresh",
      message: `资料刷新：${observations.filter((o) => o.status === "changed").length} 个快照变化，${observations.filter((o) => o.status === "failed").length} 个读取失败；受影响参数已撤销确认。`,
      at: next.refresh.at,
    },
  ];
  return next;
}
