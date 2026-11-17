import {isMerchantProduct,isNewsSource} from './source-types.mjs';
// Preserve source wording. Omission markers indicate gaps, not rewritten facts.
export function evidenceExcerpt(text, budget) {
  if (text.length <= budget) return text;
  const ranges = [[0, Math.min(350, Math.floor(budget / 3))]];
  const matcher =
    /\d+(?:\.\d+)?\s*(?:GB|kg|CNY|元|小时)|内存|重量|价格|续航|memory|weight|price|battery/gi;
  let match;
  while ((match = matcher.exec(text)) && ranges.length < 12) {
    const start = Math.max(0, match.index - 100),
      end = Math.min(text.length, match.index + 220);
    if (ranges.some(([a, b]) => start < b && end > a)) continue;
    ranges.push([start, end]);
  }
  return ranges
    .sort((a, b) => a[0] - b[0])
    .map(([a, b]) => text.slice(a, b))
    .join("\n[… omitted …]\n")
    .slice(0, budget);
}
export function sourceScore(source, index = 0) {
  const text = String(source.text || ""), title = source.title || "";
  return Math.min(18, (text.match(/\d+(?:\.\d+)?\s*(?:GB|kg|CNY|元|小时)/gi) || []).length) + (/官网|official|规格|specification|参数/i.test(title) ? 12 : 0) + (isMerchantProduct(source)?25:isNewsSource(source)?-20:0) + index / 100;
}
export function researchMessages(state, maxSourceChars = 12000) {
  if (!state.searches && !state.repairs) return state.messages;
  const order = state.sources.map((source,index)=>({index, score:sourceScore(source,index)})).sort((a,b)=>b.score-a.score);
  const budgets = new Map();
  let remaining = maxSourceChars;
  for (const [rank,item] of order.entries()) {
    const budget = Math.min(remaining, order.length<=4 ? Math.floor(maxSourceChars/Math.max(1,order.length)) : rank < 4 ? Math.floor(maxSourceChars * 0.2) : rank < 8 ? Math.floor(maxSourceChars * 0.05) : 0);
    budgets.set(item.index,budget); remaining -= budget;
  }
  const priorQueries = state.messages
    .filter((m) => m.role === "assistant")
    .map((m) => {
      try {
        return JSON.parse(m.content).query;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return [
    state.messages[0],
    state.messages[1],
    {
      role: "user",
      content: JSON.stringify({
        untrustedSearchResults: state.sources.map((s,index) => ({
          ...s,
          text: evidenceExcerpt(s.text, budgets.get(index) || 0),
          originalCharacters: s.text.length,
          excerpt: s.text.length > (budgets.get(index) || 0),
        })),
        priorQueries,
        remainingSearches: 4 - state.searches,
        repairInstruction: state.repairMessage,
        instruction:
          state.searches >= 4
            ? "Finish using available facts; mark missing facts null."
            : "Discover missing candidates or evidence using a different targeted query, or finish with explicitly unknown facts.",
      }),
    },
  ];
}
