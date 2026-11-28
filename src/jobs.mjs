import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runResearch } from "./research.mjs";
import { refreshSpace } from "./refresh.mjs";
import { mergeSupplement, supplementQueries } from "./supplement.mjs";
import { scenarioQuestion, scenarioQueries, mergeScenarioResearch } from './scenario-research.mjs';
import {decisionScenarios,validateDecisionScenarios} from './decision-schema.mjs';
import {adaptLegacyDecision} from './legacy-decision.mjs';
import {runGeneralResearch} from './general-research.mjs';
import {refreshGeneralEvidence} from './general-refresh.mjs';
export class Jobs {
  constructor(directory, store, ioFactory) {
    this.directory = resolve(directory, "jobs");
    this.store = store;
    this.ioFactory = ioFactory;
    this.records = new Map();
    this.deletedSpaceIds = new Set();
    this.active = null;
    this.closed = false;
    mkdirSync(this.directory, { recursive: true });
    this.saver = SqliteSaver.fromConnString(
      resolve(directory, "agent-checkpoints.sqlite"),
    );
    this.saver.db.pragma("journal_mode = WAL");
    this.saver.db.pragma("busy_timeout = 5000");
    this.saver.db.pragma("secure_delete = ON");
    for (const name of readdirSync(this.directory).filter((n) =>
      /^[a-f0-9-]{36}\.json$/.test(n),
    )) {
      try {
        const job = JSON.parse(
          readFileSync(resolve(this.directory, name), "utf8"),
        );
        if (
          job.id !== name.slice(0, -5) ||
          !["research", "refresh", "scenario", "adapt"].includes(job.type)
        )
          continue;
        this.records.set(job.id, job);
      } catch {}
    }
  }
  recover() {
    for (const job of this.records.values())
      if (job.status === "running") {
        job.status = "interrupted";
        job.error =
          "服务曾中断，可从最后一个检查点继续；未完成的工具调用可能重新执行。";
        this.persist(job);
      }
  }
  get busy() {
    return Boolean(this.active);
  }
  list() {
    return [...this.records.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  get(id) {
    const job = this.records.get(id);
    if (!job)
      throw Object.assign(new Error("研究任务不存在"), { statusCode: 404 });
    return job;
  }
  persist(job) {
    const path = resolve(this.directory, job.id + ".json"),
      temp = path + ".tmp";
    writeFileSync(temp, JSON.stringify(job, null, 2), { mode: 0o600 });
    renameSync(temp, path);
  }
  async deleteForSpaces(versionIds) {
    const ids = new Set(versionIds);
    const related = this.list().filter(job => [job.parentId, job.spaceId, job.resultId].some(id => ids.has(id)));
    if (related.some(job => job.status === 'running'))
      throw Object.assign(new Error('这个空间仍有研究任务运行，请等任务完成后再删除。'), { statusCode: 409 });
    versionIds.forEach(id => this.deletedSpaceIds.add(id));
    if (related.length) this.saver.setup();
    for (const job of related) {
      await this.saver.deleteThread(job.id);
      for (const suffix of ['.json', '.json.tmp', '.refresh.json', '.refresh.json.tmp']) {
        try { unlinkSync(resolve(this.directory, job.id + suffix)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      this.records.delete(job.id);
    }
    if (related.length) this.saver.db.pragma('wal_checkpoint(TRUNCATE)');
    return { deletedJobIds: related.map(job => job.id) };
  }
  start({ question, type = "research", parentId, scenarios, scenarioId, adaptive=false, change, researchFocus }) {
    if (this.deletedSpaceIds.has(parentId))
      throw Object.assign(new Error('这个决策空间已删除'), { statusCode: 404 });
    if (this.busy)
      throw Object.assign(new Error("已有任务运行中，请等待完成"), {
        statusCode: 429,
      });
    if (
      type === "research" &&
      (typeof question !== "string" ||
        question.trim().length < 8 ||
        question.length > 2000)
    )
      throw new Error("请输入 8–2000 字的研究需求");
    const job = {
      id: randomUUID(),
      resultId: randomUUID(),
      type,
      question,
      parentId,
      ...(adaptive||type==='adapt'?{workflow:'adaptive'}:{}),
      ...(change?{change}:{}),
      ...(researchFocus?{researchFocus}:{}),
      ...(['scenario','adapt'].includes(type)?{scenarios,scenarioId}:{}),
      status: "running",
      events: [],
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    this.records.set(job.id, job);
    this.persist(job);
    this.launch(job, false);
    return job;
  }
  resume(id) {
    if (this.busy)
      throw Object.assign(new Error("已有任务运行中，请等待完成"), {
        statusCode: 429,
      });
    const job = this.get(id);
    if (!["failed", "interrupted"].includes(job.status))
      throw Object.assign(new Error("仅失败或中断的任务可以继续"), {
        statusCode: 409,
      });
    job.status = "running";
    delete job.error;
    this.persist(job);
    this.launch(job, true);
    return job;
  }
  launch(job, resume) {
    job.attempts++;
    job.updatedAt = new Date().toISOString();
    this.persist(job);
    const progress = (event) => {
      job.events.push(event);
      if (job.events.length > 150) job.events.shift();
      this.persist(job);
    };
    const task = (async () => {
      let parent = null,
        result;
      const io = this.ioFactory();
      if(job.parentId)parent=await this.store.get(job.parentId);
      if(parent&&!parent.schema&&job.workflow==='adaptive')parent=adaptLegacyDecision(parent);
      if(job.type==='refresh'&&parent?.schema){
        const path=resolve(this.directory,job.id+'.refresh.json');let snapshot=null;
        if(resume){try{snapshot=JSON.parse(readFileSync(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}}
        result=await refreshGeneralEvidence(parent,io,progress,{snapshot,onCheckpoint:state=>{writeFileSync(path+'.tmp',JSON.stringify(state),{mode:0o600});renameSync(path+'.tmp',path);}});
      }else if(parent?.schema||job.workflow==='adaptive'){
        if(parent&&!parent.schema)parent=adaptLegacyDecision(parent);
        const config={configurable:{thread_id:job.id}},existing=resume?await this.saver.getTuple(config):null;
        const scenarios=parent?validateDecisionScenarios(parent,job.scenarios||decisionScenarios(parent)):null;
        const scenario=scenarios?.find(s=>s.id===job.scenarioId)||scenarios?.find(s=>s.id===parent.activeScenarioId)||scenarios?.[0];
        result=await runGeneralResearch(job.question,io,progress,{checkpointer:this.saver,threadId:job.id,resume:Boolean(existing),previous:parent,scenarios,scenario,adaptation:job.change||null,researchFocus:job.researchFocus||null});
      } else if (job.type === "refresh") {
        parent = await this.store.get(job.parentId);
        const path = resolve(this.directory, job.id + ".refresh.json");
        let snapshot = null;
        if (resume) {
          try {
            snapshot = JSON.parse(readFileSync(path, "utf8"));
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
        result = await refreshSpace(parent, io, progress, {
          snapshot,
          onCheckpoint: (state) => {
            writeFileSync(path + ".tmp", JSON.stringify(state), {
              mode: 0o600,
            });
            renameSync(path + ".tmp", path);
          },
        });
      } else {
        if(job.parentId)parent=await this.store.get(job.parentId);
        const config = { configurable: { thread_id: job.id } };
        const existing = resume ? await this.saver.getTuple(config) : null;
        const exploring=job.type==='scenario';
        const selected=exploring?job.scenarios.find(s=>s.id===job.scenarioId):null;
        if(exploring)progress({node:'scenario',type:'thinking',message:`情景「${selected.name}」：探索预算 ${selected.settings.budget} 元、内存 ≥${selected.settings.minMemory}GB、重量 ≤${selected.settings.maxWeight}kg 的新方案，不限于原有型号。`,at:new Date().toISOString()});
        result = await runResearch(exploring?scenarioQuestion(parent,selected):job.question, io, progress, {
          checkpointer: this.saver,
          threadId: job.id,
          resume: Boolean(existing),
          checkpointStorage: "sqlite",
          seedQueries:exploring?scenarioQueries(parent,selected):parent?supplementQueries(parent):undefined,
          targetCandidates:parent&&!exploring?parent.candidates.filter(c=>c.enabled!==false).slice(0,3).map(c=>({name:c.proposedName||c.originalName||c.name,facts:{}})):undefined,
          targetSettings:exploring?selected.settings:parent?.settings,
          excludeProductUrls:exploring?parent.candidates.map(c=>c.productData?.sourceProductUrl).filter(Boolean):undefined,
        });
        if(exploring) {
          result=mergeScenarioResearch(parent,result,job);
          progress({node:'scenario',type:'complete',message:result.scenarios.find(s=>s.id===job.scenarioId).research.summary,at:new Date().toISOString()});
          result.scenarios.find(s=>s.id===job.scenarioId).research.events=structuredClone(job.events);
        } else if(job.parentId) {
          result=mergeSupplement(parent,result,job.id);
        }
      }
      const saved = await this.store.save(
        { ...result, researchJobId: job.id },
        parent,
        { id: job.resultId },
      );
      job.spaceId = saved.id;
      job.status = "complete";
      delete job.error;
    })()
      .catch((error) => {
        job.status = "failed";
        job.error = error.message;
      })
      .finally(() => {
        job.updatedAt = new Date().toISOString();
        this.persist(job);
        this.active = null;
      });
    this.active = task;
  }
  close() {
    if (!this.closeTask)
      this.closeTask = (async () => {
        if (this.active) await this.active;
        this.saver.db.close();
      })();
    return this.closeTask;
  }
}
