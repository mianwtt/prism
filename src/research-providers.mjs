import { ChatOllama } from "@langchain/ollama";
import { publicSettings } from "./config.mjs";
import { searchWithTofu, fetchWithTofu, fetchImagesWithTofu } from "./tofu-search.mjs";
import { safeUrl } from "./evidence.mjs";
import {readPublicMerchantOffer} from './merchant-browser.mjs';
import {discoverMerchantProducts} from './catalog-discovery.mjs';
import {readPublicRentalPage,rentalDetailUrl,rentalCatalogUrl} from './public-rental-read.mjs';
async function postJson(url, body, headers = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok)
    throw new Error(
      `研究服务返回 HTTP ${r.status}，请检查密钥、模型名称及额度`,
    );
  const text = await r.text();
  if (text.length > 5_000_000) throw new Error("研究服务响应过大");
  return JSON.parse(text);
}
export function liveConfigured(env = process.env) {
  return publicSettings(env).ready;
}
export function providers(env = process.env) {
  const base = env.LLM_BASE_URL || "https://api.openai.com/v1";
  const url = new URL(base);
  const isOllama =
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.port === "11434";
  const ollama = isOllama
    ? new ChatOllama({
        baseUrl: base.replace(/\/v1\/?$/, ""),
        model: env.LLM_MODEL,
        format: "json",
        think: false,
        temperature: 0,
        maxRetries: 0,
        numCtx: 16384,
      })
    : null;
  const adapter = {
    publicReadHints:['需要具体出租房源时，可先用“用户所选城市 租房 房天下”这样的简短查询发现公开目录，再选择目录中实际观察到的详情链接；fang.com 的公开桌面版及移动版租房列表与详情可读取主信息和原页图片。不要把租金、面积、原图等全部要求叠入搜索关键词；页面可能不可用，必须实读验证，不进入登录或验证页面。'],
    discoverProducts:env.SEARCH_PROVIDER==='tofu'?(settings,onProgress,{excludeUrls=[]}={})=>discoverMerchantProducts(settings,{env,onProgress,excludeUrls}):undefined,
    readMerchantOffer:env.SEARCH_PROVIDER==='tofu'?url=>readPublicMerchantOffer(url,env):undefined,
    enrichImages: env.SEARCH_PROVIDER === "tofu" ? urls => fetchImagesWithTofu(urls, env) : undefined,
    async model(messages) {
      if (ollama) {
        const result = await ollama.invoke(messages, {
          signal: AbortSignal.timeout(60000),
        });
        if (typeof result.content !== "string")
          throw new Error("本地模型没有返回文本 JSON");
        return JSON.parse(result.content);
      }
      const result = await postJson(
        base.replace(/\/$/, "") + "/chat/completions",
        {
          model: env.LLM_MODEL,
          messages,
          response_format: { type: "json_object" },
        },
        { Authorization: "Bearer " + env.LLM_API_KEY },
      );
      const content = result.choices?.[0]?.message?.content;
      if (typeof content !== "string")
        throw new Error("模型没有返回 JSON 内容");
      return JSON.parse(content);
    },
    async search(query) {
      if (env.SEARCH_PROVIDER === "tofu") return searchWithTofu(query, env);
      const result = await postJson(
        "https://api.tavily.com/search",
        {
          query,
          max_results: 4,
          include_raw_content: true,
          search_depth: "advanced",
        },
        { Authorization: "Bearer " + env.TAVILY_API_KEY },
      );
      return result.results ?? [];
    },
    async fetchSource(rawUrl) {
      const url = safeUrl(rawUrl);
      if (!url) throw new Error("无效的来源地址");
      if(rentalDetailUrl(url)||rentalCatalogUrl(url))return readPublicRentalPage(url);
      if (env.SEARCH_PROVIDER === "tofu") return fetchWithTofu(url, env);
      const response = await postJson(
        "https://api.tavily.com/extract",
        { urls: [url], extract_depth: "basic", format: "markdown" },
        { Authorization: "Bearer " + env.TAVILY_API_KEY },
      );
      const page = response.results?.find((r) => r.url === url);
      if (!page?.raw_content) throw new Error("来源读取失败");
      return page.raw_content;
    },
  };
  return { ...adapter, extractFacts: adapter.model, searchCandidateSources: adapter.search };
}
