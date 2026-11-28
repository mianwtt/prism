import { ChatOllama } from "@langchain/ollama";
import { publicSettings } from "./config.mjs";
import { searchWithTofu, fetchWithTofu, fetchImagesWithTofu } from "./tofu-search.mjs";
import { safeUrl } from "./evidence.mjs";
import {readPublicMerchantOffer} from './merchant-browser.mjs';
import {discoverMerchantProducts} from './catalog-discovery.mjs';
import {readPublicRentalPage,rentalDetailUrl,rentalCatalogUrl,discoverPublicRentalCatalog} from './public-rental-read.mjs';
import {readPublicMerchantPage,merchantCatalogUrl} from './public-merchant-read.mjs';
import {suningMobileUrl} from './merchant-browser.mjs';
import { createSearchCache } from './search-cache.mjs';
import { createHash } from 'node:crypto';
import { createMcpResearchAdapter } from './mcp-research.mjs';
import {federatedSearch,searchSearxng} from './search-network.mjs';
import {readStructuredProductPage,readReadablePublicPage} from './public-product-page.mjs';
import {readWithCrawl4ai} from './crawl4ai-reader.mjs';
import {isMerchantProduct} from './source-types.mjs';
import {configured} from './config.mjs';
import {readProductWithEdge,browserProductUrl} from './product-browser.mjs';
import {retailProfile} from './retail-page.mjs';
import {discoverRetailCatalog,retailCatalogUrl,readRetailCatalogPage} from './retail-catalog.mjs';
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
export function providers(env = process.env, { searchCache = createSearchCache(env) } = {}) {
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
  const primary=['tofu','searxng'].includes(env.SEARCH_PROVIDER)?env.SEARCH_PROVIDER:'tavily';
  const searchDrivers={
    ...(primary==='tofu'?{tofu:(query,options)=>searchWithTofu(query,env,options)}:{}),
    ...(configured(env.SEARXNG_URL||env.TOFU_SEARCH_SEARXNG_URL)?{searxng:(query,options)=>searchSearxng(query,env,options)}:{}),
    ...(configured(env.TAVILY_API_KEY)?{tavily:async(query,{maxResults=8}={})=>(await postJson('https://api.tavily.com/search',{query,max_results:maxResults,include_raw_content:true,search_depth:'advanced'},{Authorization:'Bearer '+env.TAVILY_API_KEY})).results||[]}:{}),
  };
  const adapter = {
    publicCatalogs:[{platform:'dfrobot',input:'keywords',capabilities:['electronics-components','configuration-attributes'],description:'开发板、树莓派、Arduino、电子模块与传感器的专业商家公开目录。关键词写具体器件或板卡类型，不写预算，不适用于普通笔记本或家居。详情可核对单板和含配件套件。'},
      {platform:'waveshare',input:'keywords',capabilities:['electronics-components','configuration-attributes'],description:'开发板、单板机、电子扩展板、显示屏等微雪电子公开目录；适合与dfrobot交叉核对同款器件报价。'},
      {platform:'suning',input:'keywords',capabilities:['price-range','price-ascending','configuration-attributes'],description:'消费电子、家电等公开商品目录；keywords只写商品类别及明确配置，不写用途、预算或重量；专业开发板优先用dfrobot。价格上限由应用映射到平台控件，原页参数可用于保守配置分组'},
      {platform:'fang-rentals',input:'location',capabilities:['geographic-scope'],description:'公开租房目录；location只写城市名。根据房天下公开城市索引找到实际目录，明确要求的行政区沿原页实际面包屑进入，并逐个核对详情中的城市和区域。不填猜测的房源和通勤。'}],
    searchCatalog:async request=>{
      if(request?.platform==='fang-rentals')return discoverPublicRentalCatalog(request.location,request);
      if(['dfrobot','waveshare'].includes(request?.platform))return discoverRetailCatalog(request.platform,request.keywords,env);
      if(request?.platform!=='suning'||typeof request.keywords!=='string'||!request.keywords.trim()||request.keywords.length>40)throw new Error('无效的公开目录请求');
      return readPublicMerchantPage('https://search.suning.com/'+encodeURIComponent(request.keywords.trim())+'/',env,{priceRange:request.priceRange,sort:request.sort});
    },
    publicReadHints:[
      '商品研究必须区分商品配置与商家报价。发现候选后，用原页完整型号和已核对配置跨站查价；不同平台SKU不能当作通用型号。公开标价、运费、会员/券/补贴条件、缺货和采集时间分别保留。无法核实同款或匿名价格不可读时如实保留缺项，不把搜索摘要当成交价，不声称全网最低。',
      '需要具体商品时，可先用用户给出的商品类别加公开商家平台发现目录，而不是在发现前猜品牌型号。苏宁公开商品页已有标价读取器；可寻找苏宁目录及具体商品链接，再核对同一商品的参数、标价和来源图。其他平台也可按用户要求搜索，但不能假定匿名价格可读。不得把新闻首发价、起价或补贴价作为商品标价；不登录、不以下单或库存为取数前提。',
      '需要具体出租房源时，可先用“用户所选城市 租房 房天下”这样的简短查询发现公开目录，再选择目录中实际观察到的详情链接；fang.com 的公开桌面版及移动版租房列表与详情可读取主信息和原页图片。不要把租金、面积、原图等全部要求叠入搜索关键词；页面可能不可用，必须实读验证，不进入登录或验证页面。',
    ],
    discoverProducts:env.SEARCH_PROVIDER==='tofu'?(settings,onProgress,{excludeUrls=[]}={})=>discoverMerchantProducts(settings,{env,onProgress,excludeUrls}):undefined,
    readMerchantOffer:url=>readPublicMerchantOffer(url,env),
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
    async search(query, options = {}) {
      const maxResults=options.maxResults||8,purpose=options.purpose||'research';
      return searchCache.search({provider:'federated-v1:'+primary,query,options:{max_results:maxResults,purpose,providers:Object.keys(searchDrivers),readerVersion:2,
        account:createHash('sha256').update(JSON.stringify([env.TAVILY_API_KEY||'',env.TOFU_PYTHON||'',env.SEARXNG_URL||env.TOFU_SEARCH_SEARXNG_URL||'',env.SEARXNG_ENGINES||''])).digest('hex')}},()=>federatedSearch(query,searchDrivers,{primary,purpose,maxResults}),options);
    },
    async fetchSource(rawUrl) {
      const url = safeUrl(rawUrl);
      if (!url) throw new Error("无效的来源地址");
      if(rentalDetailUrl(url)||rentalCatalogUrl(url))return readPublicRentalPage(url);
      if(suningMobileUrl(url)||merchantCatalogUrl(url))return readPublicMerchantPage(url,env);
      if(retailCatalogUrl(url))return readRetailCatalogPage(url,env);
      if(retailProfile(url)){
        try{const page=await readStructuredProductPage(url);if(page?.productObservation?.offers.length)return page;}catch{}
        return readProductWithEdge(url,env);
      }
      if(browserProductUrl(url)&&isMerchantProduct(url))try{return await readProductWithEdge(url,env);}catch(error){if(configured(env.CRAWL4AI_URL))return readWithCrawl4ai(url,env);throw error;}
      if(isMerchantProduct(url)||/\/products?\/|\/item\/|\/shop\/|\.html(?:\?|$)/i.test(url)){
        try{const page=await readStructuredProductPage(url);if(page)return page;}catch{}
        if(configured(env.CRAWL4AI_URL))try{return await readWithCrawl4ai(url,env);}catch{}
      }
      if (env.SEARCH_PROVIDER === "tofu") return fetchWithTofu(url, env);
      if(primary==='searxng'){try{return await readReadablePublicPage(url);}catch(error){if(configured(env.CRAWL4AI_URL))return readWithCrawl4ai(url,env);throw error;}}
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
  const direct = { ...adapter, extractFacts: adapter.model, searchCandidateSources: adapter.search, close: () => searchCache.close(), toolTransport: 'direct' };
  return env.PRISM_TOOL_TRANSPORT === 'direct' ? direct : createMcpResearchAdapter(direct);
}
