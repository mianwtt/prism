import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "./store.mjs";
import { importSpace, IMPORT_LIMIT } from './space-import.mjs';
import { demoSpace } from "./demo.mjs";
import {housingDemo} from './general-space.mjs';
import {rentalShowcase} from './rental-showcase.mjs';
import {converse,asksForResearch} from './conversation.mjs';
import {adaptLegacyDecision} from './legacy-decision.mjs';
import {validateDecisionScenarios,summarizeConditions} from './decision-schema.mjs';
import { editSpace, diffSpaces } from "./space-edits.mjs";
import { Jobs } from "./jobs.mjs";
import {adaptiveAgentInfo} from './general-research.mjs';
import { supplementQuestion } from "./supplement.mjs";
import {prepareScenario,scenarioQuestion} from './scenario-research.mjs';
import {
  liveConfigured,
  providers,
  runResearch,
  agentInfo,
} from "./research.mjs";
import { loadSettings, publicSettings, saveSettings } from "./config.mjs";
import { createSearchCache } from './search-cache.mjs';
import packageInfo from "../package.json" with { type: "json" };
const root = fileURLToPath(new URL("../", import.meta.url));
async function body(req, limit = 100000) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > limit) throw Object.assign(new Error("请求内容过大"), {statusCode:413});
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error("无效 JSON");
  }
}
export function createApp({
  directory = resolve(root, "data"),
  env = process.env,
  io,
  configFile = resolve(directory, "provider-settings.json"),
} = {}) {
  env = { ...env };
  loadSettings(configFile, env);
  const searchCache = createSearchCache({ ...env, PRISM_DATA_DIR: directory });
  const researchIO = () => io || providers(env, { searchCache });
  const store = new Store(directory),
    jobs = new Jobs(directory, store, researchIO);
  const server = createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(
          new URL("http://" + req.headers.host).hostname,
        )
      )
        return json(403, { error: "此版本仅支持本机访问" });
      if (
        req.headers.origin &&
        req.headers.origin !== "http://" + req.headers.host
      )
        return json(403, { error: "拒绝跨站请求" });
      const path = new URL(req.url, "http://localhost").pathname;
      if (req.method === "GET" && path === "/api/settings")
        return json(200, publicSettings(env));
      if (req.method === "POST" && path === "/api/settings") {
        if (jobs.busy)
          return json(409, { error: "请等待当前研究完成后再修改服务配置" });
        return json(200, await saveSettings(configFile, await body(req), env));
      }
      if (req.method === "GET" && path === "/api/health")
        return json(200, {
          ok: true,
          live: liveConfigured(env),
          version: packageInfo.version,
          agent: { ...adaptiveAgentInfo, checkpointStorage: "sqlite",legacy:agentInfo },
          searchProvider: publicSettings(env).searchProvider,
          searchCache: searchCache.info(),
          capabilities:{scenarioResearch:true,spaceDeletion:true},
        });
      if (req.method === "GET" && path === "/api/agent")
        return json(200, { ...adaptiveAgentInfo, checkpointStorage: "sqlite",legacy:agentInfo });
      if (req.method === "GET" && path === "/api/jobs")
        return json(200, jobs.list());
      if (req.method === "GET" && path === "/api/spaces")
        return json(200, await store.list());
      if (req.method === 'POST' && path === '/api/spaces/import')
        return json(201, await store.save(importSpace(await body(req, IMPORT_LIMIT))));
      if (req.method === "POST" && path === "/api/spaces/demo")
        return json(201, await store.save(demoSpace()));
      if(req.method==='POST'&&path==='/api/spaces/demo/housing')return json(201,await store.save(housingDemo()));
      if(req.method==='POST'&&path==='/api/spaces/demo/rental-showcase')return json(201,await store.save(rentalShowcase()));
      const match = path.match(
        /^\/api\/spaces\/([a-f0-9-]{36})(\/versions|\/export|\/diff|\/refresh|\/research|\/explore|\/adapt|\/conversation)?$/,
      );
      if (match) {
        let previous = await store.get(match[1]);
        if(req.method==='DELETE'&&!match[2])
          return json(200,await store.deleteRoot(match[1],{beforeDelete:ids=>jobs.deleteForSpaces(ids)}));
        if(req.method==='POST'&&match[2]==='/conversation'){
          if(jobs.busy)return json(409,{error:'助手正在研究，请等这轮完成后继续对话'});
          const input=await body(req);
          const automaticResearch=input.autoResearch===true&&previous.mode!=='demo'&&asksForResearch(input.message||'');
          if(automaticResearch&&!liveConfigured(env)&&!io)return json(503,{error:'请先连接研究助手，再继续核对公开资料'});
          previous=adaptLegacyDecision(previous);
          const next=await converse(previous,input,previous.mode==='demo'?null:researchIO());
          if(next.pendingConversationResearch&&!liveConfigured(env)&&!io)return json(503,{error:'请先连接研究助手，再继续核对公开资料'});
          const saved=await store.save(next,previous);
          if(next.pendingConversationResearch){
            const job=jobs.start({type:'adapt',adaptive:true,parentId:saved.id,question:saved.question,change:next.pendingConversationResearch.request,scenarios:saved.scenarios,scenarioId:saved.activeScenarioId});
            return json(201,{...saved,nextAction:{type:'research',jobId:job.id}});
          }
          return json(201,saved);
        }
        if(req.method==='POST'&&match[2]==='/adapt'){
          const input=await body(req);
          if(typeof input.change!=='string'||input.change.trim().length<2||input.change.length>300)throw new Error('请描述新的关注点或条件');
          if(!liveConfigured(env)&&!io)return json(503,{error:'请先连接研究助手'});
          previous=adaptLegacyDecision(previous);
          const scenarios=validateDecisionScenarios(previous,input.scenarios),scenario=scenarios.find(s=>s.id===input.scenarioId)||scenarios[0];
          return json(202,jobs.start({type:'adapt',adaptive:true,parentId:previous.id,question:previous.question,change:input.change.trim(),scenarios,scenarioId:scenario.id}));
        }
        if(req.method==='POST'&&match[2]==='/explore'){
          if(previous.mode==='demo')throw new Error('演示空间不调用真实检索，请创建联网研究');
          if(!liveConfigured(env)&&!io)return json(503,{error:'请先配置研究服务'});
          const input=await body(req);
          if(input.adaptive)previous=adaptLegacyDecision(previous);
          if(previous.schema){
            const scenarios=validateDecisionScenarios(previous,input.scenarios),selected=scenarios.find(s=>s.id===input.scenarioId);
            if(!selected||selected.id==='scenario-baseline')throw new Error('请选择新的 What-if 情景，当前情况会保持不变');
            return json(202,jobs.start({type:'scenario',adaptive:true,parentId:previous.id,scenarios,scenarioId:selected.id,question:`${previous.question}\n新的条件：${summarizeConditions(selected.settings,previous.schema)}`}));
          }
          const {scenarios,selected}=prepareScenario(previous,input.scenarios,input.scenarioId);
          if(selected.id==='scenario-baseline')throw new Error('当前情况会固定保留，请先创建一个 What-if 分支');
          return json(202,jobs.start({type:'scenario',parentId:previous.id,scenarioId:selected.id,scenarios,question:scenarioQuestion(previous,selected)}));
        }
        if(req.method==="POST" && match[2]==="/research") {
          if(previous.mode==="demo")throw new Error("演示资料不能用于真实补充检索");
          if(!liveConfigured(env)&&!io)return json(503,{error:"请先配置研究服务"});
          return json(202,jobs.start({type:"research",question:previous.schema?previous.question:supplementQuestion(previous),parentId:previous.id}));
        }
        if (req.method === "GET" && match[2] === "/diff") {
          const against =
            new URL(req.url, "http://localhost").searchParams.get("against") ||
            previous.parentId;
          if (!against) return json(200, null);
          const baseline = await store.get(against);
          if (baseline.rootId !== previous.rootId)
            throw new Error("只能比较同一决策空间的版本");
          return json(200, diffSpaces(baseline, previous));
        }
        if (req.method === "POST" && match[2] === "/refresh") {
          if (previous.mode === "demo") throw new Error("演示资料无需联网刷新");
          if (!liveConfigured(env) && !io)
            return json(503, { error: "请先配置研究服务" });
          const input=await body(req);
          return json(
            202,
            jobs.start({
              type: "refresh",
              question: previous.question,
              parentId: previous.id,
              adaptive:input.adaptive===true,
            }),
          );
        }
        if (req.method === "GET") {
          if (match[2] === "/export")
            res.setHeader(
              "Content-Disposition",
              `attachment; filename="prism-${previous.id}.json"`,
            );
          return json(
            200,
            match[2] === "/versions"
              ? (await store.list()).filter((s) => s.rootId === previous.rootId)
              : previous,
          );
        }
        if (req.method === "POST" && match[2] === "/versions") {
          const input=await body(req);
          if(input.adaptive)previous=adaptLegacyDecision(previous);
          const next = editSpace(previous,input);
          return json(201, await store.save(next, previous));
        }
      }
      if (req.method === "POST" && path === "/api/research") {
        if (!liveConfigured(env) && !io)
          return json(503, {
            error: "尚未配置联网研究，请打开右上角的研究设置。",
          });
        const { question,adaptive=false } = await body(req);
        return json(202, jobs.start({ question,adaptive:adaptive===true }));
      }
      const jobMatch = path.match(/^\/api\/jobs\/([a-f0-9-]{36})(\/resume)?$/);
      if (jobMatch) {
        if (req.method === "GET" && !jobMatch[2])
          return json(200, jobs.get(jobMatch[1]));
        if (req.method === "POST" && jobMatch[2] === "/resume") {
          jobs.get(jobMatch[1]);
          if (!liveConfigured(env) && !io)
            return json(503, { error: "请先配置研究服务" });
          return json(202, jobs.resume(jobMatch[1]));
        }
      }
      const assets = {
        "/": ["public/index.html", "text/html"],
        "/classic": ["public/index.html", "text/html"],
        "/app.mjs": ["public/app.mjs", "text/javascript"],
        "/style.css": ["public/style.css", "text/css"],
        "/studio.css": ["public/studio.css", "text/css"],
        "/decision-schema.mjs": ["src/decision-schema.mjs", "text/javascript"],
        "/decision-workflow.mjs": ["src/decision-workflow.mjs", "text/javascript"],
        "/branch-comparison.mjs": ["src/branch-comparison.mjs", "text/javascript"],
        "/branch-comparison-view.mjs": ["public/branch-comparison-view.mjs", "text/javascript"],
        "/branch-comparison.css": ["public/branch-comparison.css", "text/css"],
        "/decision-evidence.mjs": ["src/decision-evidence.mjs", "text/javascript"],
        "/legacy-decision.mjs": ["src/legacy-decision.mjs", "text/javascript"],
        "/universal-view.mjs": ["public/universal-view.mjs", "text/javascript"],
        "/workspace-draft.mjs": ["src/workspace-draft.mjs", "text/javascript"],
        "/branch-canvas.mjs": ["public/branch-canvas.mjs", "text/javascript"],
        "/live-conditions.mjs": ["public/live-conditions.mjs", "text/javascript"],
        "/universal.css": ["public/universal.css", "text/css"],
        "/compact-canvas.css": ["public/compact-canvas.css", "text/css"],
        "/workflow.css": ["public/workflow.css", "text/css"],
        "/studio-design.css": ["public/studio-design.css", "text/css"],
        "/workflow-view.mjs": ["public/workflow-view.mjs", "text/javascript"],
        "/engine.mjs": ["src/engine.mjs", "text/javascript"],
        "/scenarios.mjs": ["src/scenarios.mjs", "text/javascript"],
        "/decision-view.mjs": ["public/decision-view.mjs", "text/javascript"],
        "/favicon.svg": ["public/favicon.svg", "image/svg+xml"],
      };
      if (req.method === "GET" && assets[path]) {
        const [file, type] = assets[path];
        const bytes = await readFile(resolve(root, file));
        res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
        return res.end(bytes);
      }
      return json(404, { error: "页面或接口不存在" });
    } catch (error) {
      return json(error.statusCode || (error.code === "ENOENT" ? 404 : 400), {
        error: error.code === "ENOENT" ? "空间不存在" : error.message,
      });
    }
  });
  server.once("listening", () => jobs.recover());
  server.once("error", () => { searchCache.close(); jobs.close(); });
  server.once("close", () => { searchCache.close(); jobs.close(); });
  let shutdownPromise;
  server.shutdown = () => shutdownPromise ??= (async () => {
    await new Promise((r, reject) => {
      server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : r());
      // Browsers may leave speculative sockets open even after navigating away.
      // Explicit shutdown must also release those connections before closing SQLite.
      server.closeAllConnections();
    });
    await jobs.close();
    searchCache.close();
  })();
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createApp({
    directory: resolve(root, process.env.PRISM_DATA_DIR || "data"),
  });
  server.listen(
    Number(process.env.PORT || 4317),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        "Prism is ready: http://localhost:" + (process.env.PORT || 4317),
      ),
  );
}
