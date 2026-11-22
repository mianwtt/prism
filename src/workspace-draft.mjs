import {validateDecisionScenarios} from './decision-schema.mjs';

const prefix='prism:workspace-draft:v1:',memory=new Map();
const localStore=()=>{try{return globalThis.localStorage;}catch{return null;}};
const key=id=>prefix+id;
function normalized(space,raw){
 if(!raw||raw.spaceId!==space.id||raw.rootId!==(space.rootId||space.id))throw new Error('草稿不属于当前版本');
 const scenarios=validateDecisionScenarios(space,raw.scenarios),ids=new Set(scenarios.map(s=>s.id)),candidateIds=new Set(space.candidates.map(c=>c.id));
 // New local children inherit their actual parent's research pool. Validation
 // must not widen that pool to every source ever collected in the workspace.
 const done=new Set(),resolve=branch=>{
  if(done.has(branch.id))return;
  const prior=space.scenarios?.find(s=>s.id===branch.id);
  if(!prior&&branch.id!=='scenario-baseline'){
   const parent=scenarios.find(s=>s.id===branch.parentScenarioId);resolve(parent);
   const supplied=raw.scenarios.find(s=>s.id===branch.id)?.candidateIds||parent.candidateIds;
   if(!Array.isArray(supplied)||new Set(supplied).size!==supplied.length||supplied.some(id=>!candidateIds.has(id)||!parent.candidateIds.includes(id)))throw new Error('草稿引用了路径之外的方案');
   branch.candidateIds=[...supplied];
  }
  done.add(branch.id);
 };scenarios.forEach(resolve);
 const activeScenarioId=ids.has(raw.activeScenarioId)?raw.activeScenarioId:'scenario-baseline';
 const canvasScenarioIds=[...new Set(['scenario-baseline',...(Array.isArray(raw.canvasScenarioIds)?raw.canvasScenarioIds:[])].filter(id=>ids.has(id)))];
 const decisionDraft={candidateId:space.candidates.some(c=>c.id===raw.decisionDraft?.candidateId)?raw.decisionDraft.candidateId:'',rationale:String(raw.decisionDraft?.rationale||'').slice(0,1500)};
 return {scenarios,activeScenarioId,canvasScenarioIds,dirty:raw.dirty===true,pane:['canvas','evidence','memory','research'].includes(raw.pane)?raw.pane:'canvas',
  chatDraft:String(raw.chatDraft||'').slice(0,1500),researchDraft:String(raw.researchDraft||'').slice(0,1500),decisionDraft};
}
export function readWorkspaceDraft(space,storage=localStore()){
 try{
  const text=storage?.getItem(key(space.id))||memory.get(key(space.id));
  return text&&text.length<=150000?normalized(space,JSON.parse(text)):null;
 }catch{return null;}
}
export function writeWorkspaceDraft(space,draft,storage=localStore()){
 const text=JSON.stringify({...draft,spaceId:space.id,rootId:space.rootId||space.id});
 if(text.length>150000)return false;
 memory.set(key(space.id),text);
 try{if(!storage)return false;storage.setItem(key(space.id),text);return true;}catch{return false;}
}
export function clearWorkspaceDraft(id,storage=localStore()){
 memory.delete(key(id));try{storage?.removeItem(key(id));}catch{}
}
export function clearWorkspaceDrafts(rootId,storage=localStore()){
 const keys=new Set(memory.keys());try{for(let i=0;i<storage?.length;i++){const name=storage.key(i);if(name?.startsWith(prefix))keys.add(name);}}catch{}
 for(const name of keys)try{
  const text=storage?.getItem(name)||memory.get(name);
  if(JSON.parse(text||'null')?.rootId===rootId)clearWorkspaceDraft(name.slice(prefix.length),storage);
 }catch{}
}
export function exportWorkspaceSnapshot(space,state){
 const draft=normalized(space,{...state,spaceId:space.id,rootId:space.rootId||space.id}),selected=draft.scenarios.find(s=>s.id===draft.activeScenarioId);
 return {...structuredClone(space),scenarios:draft.scenarios,activeScenarioId:selected.id,settings:structuredClone(selected.settings),canvasScenarioIds:draft.canvasScenarioIds};
}
