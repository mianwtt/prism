import {
  StateGraph,
  StateSchema,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { defaultSettings, validateSettings } from "./engine.mjs";
import { enrichCandidateMedia } from "./media.mjs";
import { safeUrl, validateCandidates } from "./evidence.mjs";
import { researchPrompt } from "./research-prompt.mjs";
import { researchMessages } from "./agent-context.mjs";
import { extractCandidateFacts } from "./source-extraction.mjs";
import {gatherCandidateSources} from './candidate-retrieval.mjs';
import {enrichCandidatePrices} from './price-observations.mjs';
import {buildComparisonData} from './product-data.mjs';
import {createComparisonSpace} from './comparison-space.mjs';

export const agentInfo = Object.freeze({
  framework: "LangGraph",
  frameworkPackage: "@langchain/langgraph",
  toolFramework: "LangChain Core",
  localModelAdapter: "ChatOllama",
  graphVersion: 4,
  nodes: ["initialize", "discover", "plan", "search", "repair", "extract", "verify", "complete"],
  limits: { catalogChecks:16,catalogReady:8,searches: 4, candidateSearches:18, priceReads:3,merchantReads:3, plannerCalls: 7, extractionCalls: 3, modelCalls: 10, additionalReads: 3, repairs: 2 },
  checkpointStorage: "memory",
  review: "Extracted facts require confirmation in the decision workspace.",
});
const questionSchema = z.string().trim().min(8).max(2000);
const searchInput = z.object({ query: z.string().trim().min(1).max(500) });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: searchInput.shape.query }),
  z.object({
    action: z.literal("finish"),
    candidates: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(150),
          facts: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .min(1)
      .max(6),
    settings: z.unknown().optional(),
  }),
]);
const stateSchema = new StateSchema({
  question: z.string(),
  catalogData:z.unknown().nullable().default(null),
  excludeProductUrls:z.array(z.string()).default(()=>[]),
  seedQueries:z.array(z.string()).default(()=>[]),
  targetCandidates:z.array(z.record(z.string(),z.unknown())).default(()=>[]),
  targetSettings:z.unknown().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .default(() => []),
  sources: z.array(z.record(z.string(), z.unknown())).default(() => []),
  trace: z.array(z.record(z.string(), z.unknown())).default(() => []),
  searches: z.number().default(0),
  modelCalls: z.number().default(0),
  extractionCalls: z.number().default(0),
  readCalls: z.number().default(0),
  candidateSearches:z.number().default(0),
  extractionWarnings: z.array(z.string()).default(()=>[]),
  repairs: z.number().default(0),
  action: z.unknown().nullable().default(null),
  repairMessage: z.string().nullable().default(null),
  result: z.unknown().nullable().default(null),
});

export function createResearchGraph(
  io,
  {
    onProgress = () => {},
    checkpointer = new MemorySaver(),
    interruptBefore = [],
    checkpointStorage = checkpointer instanceof MemorySaver
      ? "memory"
      : "sqlite",
  } = {},
) {
  if (typeof io?.model !== "function" || typeof io?.search !== "function")
    throw new Error("研究 Agent 需要模型与搜索工具适配器");
  const event = (node, type, message) => {
    const value = { node, type, message, at: new Date().toISOString() };
    onProgress(value);
    return value;
  };
  // The graph, not the LLM, owns budgets, transitions and evidence checks.
  const searchTool = tool(
    async ({ query }) => {
      const result = await io.search(query);
      if (!Array.isArray(result)) throw new Error("搜索工具返回了无效结果");
      return JSON.stringify(result.slice(0, 4));
    },
    {
      name: "search_web",
      description:
        "Search for authoritative laptop specifications and CNY prices; return source text for verification.",
      schema: searchInput,
    },
  );

  const builder = new StateGraph(stateSchema)
    .addNode("initialize", async (state) => {
      const parsed = questionSchema.safeParse(state.question);
      if (!parsed.success) throw new Error("请输入 8–2000 字的笔记本研究需求");
      return {
        question: parsed.data,
        messages: [
          { role: "system", content: researchPrompt },
          { role: "user", content: parsed.data },
        ],
        trace: [event("initialize", "node", "LangGraph 研究任务已初始化")],
      };
    })
    .addNode('discover',async state=>{
      if(typeof io.discoverProducts!=='function'||state.targetCandidates.length)return {};
      const trace=[];
      let settings=state.targetSettings;
      if(!settings){
        settings=structuredClone(defaultSettings);
        const budget=/(\d{3,6})\s*元/.exec(state.question),memory=/(\d+)\s*GB/i.exec(state.question),weight=/(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/i.exec(state.question);
        if(budget)settings.budget=Number(budget[1]);if(memory)settings.minMemory=Number(memory[1]);if(weight)settings.maxWeight=Number(weight[1]);
      }
      settings=validateSettings(settings);
      trace.push(event('discover','thinking','先浏览公开购物目录，跨品牌发现具体商品，再逐项检查报价和配置'));
      try{
        const data=await io.discoverProducts(settings,message=>trace.push(event('discover','search',message)),{excludeUrls:state.excludeProductUrls});
        const catalogData={comparisonReady:(data.comparisonReady||[]).slice(0,8),researchDrafts:(data.researchDrafts||[]).slice(0,16),checked:data.checked||0,discovered:data.discovered||0};
        const sources=[...(data.catalogSources||[]),...catalogData.comparisonReady.flatMap(p=>p.sources),...catalogData.researchDrafts.flatMap(p=>p.sources)];
        trace.push(event('discover','observation',`目录检查取得 ${catalogData.comparisonReady.length} 个核心字段完整的具体配置`));
        return {catalogData,sources,trace:[...state.trace,...trace],
          ...(catalogData.comparisonReady.length>=6?{action:{action:'finish',candidates:[],settings}}:{})};
      }catch(error){
        return {trace:[...state.trace,...trace,event('discover','observation','商品目录本次未完成，改用搜索引擎继续发现型号')]};
      }
    })
    .addNode("plan", async (state) => {
      if(state.searches<state.seedQueries.length && state.searches<agentInfo.limits.searches) {
        return {action:{action:"search",query:state.seedQueries[state.searches]},repairMessage:null,
          trace:[...state.trace,event("plan","thinking",`执行第 ${state.searches+1} 组目标检索`)]};
      }
      if(state.targetCandidates.length) {
        return {action:{action:"finish",candidates:state.targetCandidates,settings:state.targetSettings},repairMessage:null,
          trace:[...state.trace,event("plan","thinking","按已有候选补充证据，不重新编造或更换型号")]};
      }
      if (state.modelCalls >= agentInfo.limits.plannerCalls)
        throw new Error("研究达到模型调用上限，请缩小问题后重试");
      const planning = event(
        "plan",
        "thinking",
        `正在规划第 ${state.modelCalls + 1} 步研究`,
      );
      let raw;
      try {
        raw = await io.model(researchMessages(state));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return {
          modelCalls: state.modelCalls + 1,
          action: null,
          repairMessage:
            "上一次响应不是有效 JSON。请仅返回符合约定的 JSON 对象。",
          trace: [...state.trace, planning],
        };
      }
      const parsed = actionSchema.safeParse(raw);
      if (!parsed.success)
        return {
          modelCalls: state.modelCalls + 1,
          action: null,
          repairMessage:
            "上一次响应不符合操作结构。请返回 search（query 为 1–500 字）或 finish（包含 1–6 个具名候选）。",
          trace: [...state.trace, planning],
        };
      if (
        parsed.data.action === "search" &&
        state.searches >= agentInfo.limits.searches
      )
        return {
          modelCalls: state.modelCalls + 1,
          action: null,
          repairMessage:
            "搜索次数已达上限。必须使用已有资料 finish，缺失参数填写 null，不得继续搜索。",
          trace: [...state.trace, planning],
        };
      return {
        modelCalls: state.modelCalls + 1,
        action: parsed.data,
        repairMessage: null,
        trace: [...state.trace, planning],
      };
    })
    .addNode("repair", async (state) => {
      if (
        state.repairs >= agentInfo.limits.repairs ||
        state.modelCalls >= agentInfo.limits.plannerCalls
      )
        throw new Error("研究达到修复或调用上限，模型持续返回无效操作");
      return {
        repairs: state.repairs + 1,
        messages: [
          ...state.messages,
          { role: "user", content: state.repairMessage },
        ],
        trace: [
          ...state.trace,
          event(
            "repair",
            "repair",
            "正在要求模型修复无效操作；不会执行无效工具调用",
          ),
        ],
      };
    })
    .addNode("search", async (state) => {
      const parsed = searchInput.parse(state.action);
      if (state.searches >= agentInfo.limits.searches)
        throw new Error("研究达到搜索上限");
      const step = event("search", "search", parsed.query);
      const results = JSON.parse(await searchTool.invoke(parsed));
      const observations = results.length
        ? []
        : [
            event(
              "search",
              "observation",
              "本次搜索没有返回网页；保留已有证据，缺失信息仍为未知",
            ),
          ];
      const sources = [...state.sources],
        added = [];
      for (const result of results) {
        if (!result || typeof result !== "object") continue;
        const url = safeUrl(result.url);
        if (!url || sources.some((s) => s.url === url)) continue;
        const text = String(result.raw_content || result.content || "").slice(
          0,
          16000,
        );
        if (!text.trim()) continue;
        const source = {
          id: "s" + (sources.length + 1),
          url,
          title: String(result.title || url).slice(0, 200),
          text,
          retrievedAt: new Date().toISOString(),
          kind: result.raw_content ? "page" : "search-excerpt",
          retrieval: { engine:result.engine||"未记录",query:parsed.query,bodyChars:result.raw_content?text.length:0, snippetOnly:!result.raw_content, deadlineHit:result.retrieval?.deadlineHit===true },
        };
        sources.push(source);
        added.push(source);
      }
      const searches = state.searches + 1;
      return {
        sources,
        searches,
        trace: [...state.trace, step, ...observations],
        messages: [
          ...state.messages,
          { role: "assistant", content: JSON.stringify(state.action) },
          {
            role: "user",
            content: JSON.stringify({
              untrustedSearchResults: added,
              remainingSearches: agentInfo.limits.searches - searches,
              instruction:
                searches === agentInfo.limits.searches
                  ? "Finish using available facts; mark missing facts null."
                  : "Choose the next action.",
            }),
          },
        ],
      };
    })
    .addNode("extract", async state => {
      const trace=[];
      const gathered=await gatherCandidateSources(state.action.candidates,state.sources,io,message=>trace.push(event("extract","search",message)));
      const output=await extractCandidateFacts(state.action.candidates,gathered.sources,io,message=>trace.push(event("extract","extraction",message)));
      return { action:{...state.action,candidates:output.candidates},sources:output.sources,
        modelCalls:state.modelCalls+output.modelCalls,extractionCalls:output.modelCalls,readCalls:output.readCalls,
        candidateSearches:gathered.searches,extractionWarnings:[...gathered.warnings,...output.warnings],trace:[...state.trace,...trace] };
    })
    .addNode("verify", async (state) => {
      if (!state.sources.length)
        throw new Error("没有检索到可追溯资料，无法生成真实决策空间");
      const { candidates, warnings } = state.action.candidates.length?validateCandidates(
        state.action.candidates,state.sources,
      ):state.catalogData?.comparisonReady?.length?{candidates:[],warnings:[]}:(()=>{throw new Error('没有可用的候选来源');})();
      warnings.unshift(...state.extractionWarnings);
      const sources = structuredClone(state.sources);
      const priceTrace=[];
      const priceCollection=await enrichCandidatePrices(candidates,sources,io,message=>priceTrace.push(event('verify','price',message)));
      await enrichCandidateMedia(candidates, sources, io, warnings);
      const extracted=buildComparisonData(candidates,sources),catalog=state.catalogData;
      const distinct=products=>[...new Map(products.map(p=>[p.sourceProductUrl||p.id,p])).values()];
      const comparisonData={comparisonReady:distinct([...(catalog?.comparisonReady||[]),...extracted.comparisonReady]),researchDrafts:distinct([...(catalog?.researchDrafts||[]),...extracted.researchDrafts])};
      const presentation=comparisonData.comparisonReady.length?createComparisonSpace(comparisonData):null;
      const imagesBySource=new Map((presentation?.sources||[]).filter(s=>s.image).map(s=>[s.id,s.image]));
      for(const source of sources)if(imagesBySource.has(source.id))source.image=imagesBySource.get(source.id);
      const matched = (presentation?.candidates||candidates).reduce((n, c) => n + Object.values(c.facts).filter(f => f.status === "unreviewed").length, 0);
      const completeConstraints = comparisonData.comparisonReady.length||candidates.some(c => ["price", "memory", "weight"].every(k => c.facts[k].value !== null));
      if (!completeConstraints) warnings.unshift("本轮尚未获得价格、内存和重量齐全的候选，保留为研究草稿。");
      let settings;
      try {
        settings = validateSettings({ ...(state.targetSettings||state.action.settings), calculationMode: "reviewed" });
      } catch {
        settings = structuredClone(defaultSettings);
        warnings.unshift(
          "模型未返回有效约束，当前使用默认设置：预算 7000 元、内存 16GB、重量 2kg。请先修改为你的实际要求。",
        );
      }
      if (!/续航|battery|电池|小时/.test(state.question)) {
        settings.weights.battery=0;
        warnings.unshift("需求未指定续航，默认不对缺失的续航小时评分；可在情景偏好中主动开启。");
      }
      return {
        result: {
          title: comparisonData.comparisonReady.length?"笔记本研究 · 资料已整理":"笔记本研究 · 采集草稿",
          question: state.question,
          mode: "live",
          settings,
          candidates:presentation?.candidates||candidates,
          comparisonData,
          sources:presentation?[...sources,...presentation.sources.filter(s=>!sources.some(prior=>prior.id===s.id))]:sources,
          coverage: { returnedPages:sources.length, fullTextPages:sources.filter(s=>s.kind==="page").length,
            usableFacts:matched,totalFacts:(presentation?.candidates||candidates).length*4,additionalReads:state.readCalls,priceReads:priceCollection.reads,merchantReads:priceCollection.merchantReads,extractionCalls:state.extractionCalls },
          warnings,
        },
        trace: [
          ...state.trace,
          ...priceTrace,
          event(
            "verify",
            "verification",
            `证据检查：${matched}/${(presentation?.candidates||candidates).length * 4} 项参数通过数值、单位与引文检查；仍需人工核验配置一致性`,
          ),
        ],
      };
    })
    .addNode("complete", async (state) => {
      const trace = [
        ...state.trace,
        event("complete", "complete", `本轮采集结束：${state.result.comparisonData?.comparisonReady.length||0} 条核心字段完整的数据；其余保留为研究草稿`),
      ];
      return {
        trace,
        result: {
          ...state.result,
          trace,
          agent: {
            ...agentInfo,
            checkpointStorage,
            searches: state.searches,
            candidateSearches:state.candidateSearches,
            modelCalls: state.modelCalls,
            extractionCalls:state.extractionCalls,
            additionalReads:state.readCalls,
            repairs: state.repairs,
            catalogDiscovery:state.catalogData?{checked:state.catalogData.checked,discovered:state.catalogData.discovered,completeProducts:state.catalogData.comparisonReady.length}:null,
          },
        },
      };
    })
    .addEdge(START, "initialize")
    .addEdge('initialize','discover')
    .addConditionalEdges('discover',state=>state.catalogData?.comparisonReady?.length>=6?'verify':'plan',['verify','plan'])
    .addConditionalEdges(
      "plan",
      (state) =>
        state.repairMessage
          ? "repair"
          : state.action.action === "search"
            ? "search"
            : "extract",
      ["repair", "search", "extract"],
    )
    .addEdge("repair", "plan")
    .addEdge("search", "plan")
    .addEdge("extract", "verify")
    .addEdge("verify", "complete")
    .addEdge("complete", END);
  return builder.compile({ checkpointer, interruptBefore });
}

export async function runResearch(
  question,
  io,
  onProgress = () => {},
  options = {},
) {
  const graph = createResearchGraph(io, { onProgress, ...options });
  const seedQueries=options.seedQueries || (typeof io.discoveryQueries==="function"?io.discoveryQueries(question):[]);
  const output = await graph.invoke(options.resume ? null : { question,seedQueries:seedQueries.slice(0,3),targetCandidates:options.targetCandidates||[],targetSettings:options.targetSettings,excludeProductUrls:options.excludeProductUrls||[] }, {
    configurable: { thread_id: options.threadId || randomUUID() },
    recursionLimit: 32,
    durability: "sync",
  });
  return output.result;
}
