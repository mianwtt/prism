export const dimensions = {
  price: { label: "价格", unit: "元", min: 2000, max: 12000, direction: -1 },
  memory: { label: "内存", unit: "GB", min: 8, max: 64, direction: 1 },
  weight: { label: "重量", unit: "kg", min: 0.8, max: 3, direction: -1 },
  battery: { label: "标称续航", unit: "小时", min: 0, max: 20, direction: 1 },
};
export const defaultSettings = {
  budget: 7000,
  minMemory: 16,
  maxWeight: 2,
  weights: { price: 35, memory: 25, weight: 30, battery: 10 },
};
export function validateSettings(s) {
  if (s?.calculationMode !== undefined && !["reviewed", "provisional"].includes(s.calculationMode))
    throw new Error("无效的计算模式");
  if (
    !s ||
    !Number.isFinite(s.budget) ||
    s.budget < 0 ||
    s.budget > 1000000 ||
    !Number.isFinite(s.minMemory) ||
    s.minMemory < 0 ||
    s.minMemory > 1024 ||
    !Number.isFinite(s.maxWeight) ||
    s.maxWeight <= 0 ||
    s.maxWeight > 20
  )
    throw new Error("无效的预算、内存或重量约束");
  if (
    !s.weights ||
    Object.keys(s.weights).length !== 4 ||
    Object.keys(dimensions).some(
      (k) =>
        !Number.isFinite(s.weights[k]) ||
        s.weights[k] < 0 ||
        s.weights[k] > 100,
    )
  )
    throw new Error("偏好权重必须为 0–100");
  if (!Object.values(s.weights).some((v) => v > 0))
    throw new Error("至少设置一项非零偏好");
  return structuredClone(s);
}
export function factIssue(key, fact) {
  if (!fact || !Number.isFinite(fact.value)) return fact?.reviewReason || "缺少资料";
  if (fact.status === "confirmed") return null;
  if (fact.reviewReason) return "来源变化，需重新核验";
  const quote = fact.quote || "";
  const suffix=Number.isInteger(fact.value)?"(?:\\.0+)?":"0*";
  const number = String(fact.value).replace(".", "\\.")+suffix;
  const amount = fact.value >= 1000
    ? `(?:${number}|${fact.value.toLocaleString("en-US",{maximumFractionDigits:20}).replace(".", "\\.")+suffix})`
    : number;
  const units = {
    price: `(?:[¥￥]\\s*${amount}(?![\\d.])|${amount}\\s*(?:元|CNY|RMB))`,
    memory: `${amount}\\s*GB\\b`,
    weight: `${amount}\\s*(?:kg|千克|公斤)`,
    battery: `${amount}\\s*(?:hours?\\b|hrs?\\b|小时|h\\b)`,
  };
  if (!new RegExp(`(?<![\\d.])${units[key]}`, "i").test(quote)) return "引文未明确支持数值及单位";
  if (key === "memory" && [...quote.matchAll(/(\d+)\s*GB\s*(?:\/|或|至|~|–|-)\s*(\d+)\s*GB/gi)].some(match=>Number(match[1])<=128&&Number(match[2])<=128))
    return "多种内存配置，尚未定位具体配置";
  if (key === "price" && /起售|起价|售价.*起|参考价|starting|\bfrom\b/i.test(quote))
    return "起售价或参考价，尚非具体配置报价";
  if (key === "price" && /国补|国家补贴|补贴后|以旧换新|券后|会员价|subsid|trade.?in|coupon|member.?price/i.test(quote))
    return "附条件价格，需核对地区和优惠资格";
  return null;
}
export function usable(fact, settings = {}, key) {
  if (!Number.isFinite(fact?.value)) return false;
  if (fact.status === "confirmed") return true;
  return settings.calculationMode === "provisional" &&
    fact.status === "unreviewed" && !!fact.sourceId && !!fact.quote &&
    !factIssue(key, fact);
}
export function evaluate(candidates, rawSettings) {
  const s = validateSettings(rawSettings),
    total = Object.values(s.weights).reduce((a, b) => a + b, 0);
  return candidates
    .map((c) => {
      if (c.enabled === false)
        return {
          id: c.id,
          name: c.name,
          status: "disabled",
          score: null,
          reasons: ["已暂停比较"],
          unknown: [],
          contributions: {},
        };
      const reasons = [],
        unknown = [],
        contributions = {};
      for (const [key, test, reason] of [
        ["price", (v) => v <= s.budget, "超出预算"],
        ["memory", (v) => v >= s.minMemory, "内存不足"],
        ["weight", (v) => v <= s.maxWeight, "超过重量上限"],
      ]) {
        if (!usable(c.facts[key], s, key))
          unknown.push(dimensions[key].label + "：" + (factIssue(key, c.facts[key]) || "有引用，尚未核验"));
        else if (!test(c.facts[key].value)) reasons.push(reason);
      }
      let score = 0;
      for (const [key, d] of Object.entries(dimensions)) {
        if (!s.weights[key]) continue;
        const f = c.facts[key];
        if (!usable(f, s, key)) {
          unknown.push(d.label + "：" + (factIssue(key, f) || "有引用，尚未核验"));
          continue;
        }
        const normalized = Math.max(
          0,
          Math.min(1, (f.value - d.min) / (d.max - d.min)),
        );
        contributions[key] =
          (((d.direction === 1 ? normalized : 1 - normalized) *
            s.weights[key]) /
            total) *
          100;
        score += contributions[key];
      }
      const status = reasons.length
        ? "excluded"
        : unknown.length
          ? "unresolved"
          : "eligible";
      return {
        id: c.id,
        name: c.name,
        status,
        score: status === "eligible" ? score : null,
        reasons,
        unknown: [...new Set(unknown)],
        contributions,
      };
    })
    .sort(
      (a, b) =>
        ({ eligible: 0, unresolved: 1, excluded: 2, disabled: 3 })[a.status] -
          { eligible: 0, unresolved: 1, excluded: 2, disabled: 3 }[b.status] ||
        (b.score ?? 0) - (a.score ?? 0) ||
        a.id.localeCompare(b.id),
    );
}
export function budgetTransitions(candidates, settings) {
  const points = [
    ...new Set([
      0,
      settings.budget,
      ...candidates
        .filter((c) => usable(c.facts.price, settings, "price"))
        .map((c) => c.facts.price.value),
    ]),
  ].sort((a, b) => a - b);
  let previous = null;
  return points.flatMap((budget) => {
    const ranked = evaluate(candidates, { ...settings, budget });
    const eligible = ranked.filter((c) => c.status === "eligible"),
      winner = eligible[0]?.id ?? null;
    const changed = winner !== previous;
    previous = winner;
    return [
      {
        budget,
        winner,
        name: eligible[0]?.name ?? null,
        changed,
        eligible: eligible.map((c) => c.id),
      },
    ];
  });
}
export function comparison(before, after) {
  const old = before.find((c) => c.status === "eligible"),
    next = after.find((c) => c.status === "eligible");
  const entered = after
    .filter(
      (c) =>
        c.status === "eligible" &&
        before.find((b) => b.id === c.id)?.status !== "eligible",
    )
    .map((c) => c.name);
  const exited = before
    .filter(
      (c) =>
        c.status === "eligible" &&
        after.find((b) => b.id === c.id)?.status !== "eligible",
    )
    .map((c) => c.name);
  return {
    previous: old?.name ?? null,
    current: next?.name ?? null,
    changed: old?.id !== next?.id,
    entered,
    exited,
  };
}
