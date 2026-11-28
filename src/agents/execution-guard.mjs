import {createHash} from 'node:crypto';

export class ExecutionLimitError extends Error {
  constructor(code, message) { super(message); this.name='ExecutionLimitError'; this.code=code; }
}

// A domain policy around the existing execution adapter, not another agent loop.
export function executionGuard(role, phase, allowed, usage, limits={}) {
  const budget={modelCalls:12, toolCalls:40, contextCharacters:140000, durationMs:240000, ...limits};
  for(const [key,value] of Object.entries(budget))if(!Number.isFinite(value)||value<0)throw new Error('无效的执行预算：'+key);
  const started=Date.now();
  usage.policy={...budget,allowedTools:[...allowed]};
  usage.hooks=[];
  const record=(hook,status,detail={})=>{
    usage.hooks.push({hook,status,...detail});
    if(usage.hooks.length>100)usage.hooks.shift();
  };
  function reject(code,message,name){record('before-call','blocked',{tool:name,code});throw new ExecutionLimitError(code,message);}
  return {
    async call(name,args,operation) {
      if(!allowed.includes(name))reject('permission','该角色无权调用此能力',name);
      if(Date.now()-started>budget.durationMs)reject('deadline','本阶段执行已超时',name);
      if(name==='model'&&usage.modelCalls>=budget.modelCalls)reject('model-budget','本阶段模型调用预算已用尽',name);
      if(name!=='model'&&Object.values(usage.toolCalls).reduce((sum,count)=>sum+count,0)>=budget.toolCalls)reject('tool-budget','本阶段工具调用预算已用尽',name);
      const size=JSON.stringify(args).length;
      if(size>budget.contextCharacters)reject('context-budget','本阶段输入超出上下文预算',name);
      record('before-call','passed',{tool:name,inputCharacters:size});
      if(name==='model'){usage.modelCalls++;usage.inputCharacters+=size;}
      else usage.toolCalls[name]=(usage.toolCalls[name]||0)+1;
      const began=Date.now();
      try {
        const result=await operation();
        if(Date.now()-started>budget.durationMs){record('after-call','late',{tool:name});throw new ExecutionLimitError('deadline','本阶段返回结果已超时');}
        if(name==='model')usage.outputCharacters+=JSON.stringify(result??null).length;
        record('after-call','completed',{tool:name,milliseconds:Date.now()-began});
        return result;
      } catch(error) {record('after-call','failed',{tool:name,errorType:error.name||'Error'});throw error;}
    },
    handoff(task,artifact) {
      const digest=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
      const handoff={role,phase,taskFingerprint:digest(task),artifactFingerprint:digest(artifact),
        sources:artifact?.sources?.length??null, observations:artifact?.raw?.length??null,
        reviewFindings:artifact?.evidenceReview?.findings?.length??null,
        hasTaskMemory:Boolean(task?.taskMemory?.text||task?.previous?.taskMemory?.text||task?.result?.taskMemory?.text)};
      record('handoff','recorded');
      usage.handoff=handoff;
    },
  };
}
