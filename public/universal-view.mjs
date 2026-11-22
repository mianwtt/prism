import {branchComparisonView} from '/branch-comparison-view.mjs';
import {branchCanvas,connectBranches} from '/branch-canvas.mjs';
import {researchView,evidenceView,memoryView,versionDiffView} from '/workflow-view.mjs';
import {evidenceRows} from '/decision-workflow.mjs';
import {readWorkspaceDraft,writeWorkspaceDraft,clearWorkspaceDraft,exportWorkspaceSnapshot} from '/workspace-draft.mjs';
import {decisionScenarios,evaluateDecision,parseDecisionChange,summarizeConditions,validateDecisionSettings,formatDecisionValue,hasDecisionValue,changeScenarioSettings,resolveScenarioInheritance} from '/decision-schema.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=formatDecisionValue;
const tabIcon=key=>'<svg viewBox="0 0 20 20" aria-hidden="true">'+({canvas:'<path d="M4 10h5m0 0c4 0 3-5 7-5m-7 5c4 0 3 5 7 5"/><circle cx="3" cy="10" r="1.5"/><circle cx="17" cy="5" r="1.5"/><circle cx="17" cy="15" r="1.5"/>',research:'<circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/>',evidence:'<path d="M5 2h7l4 4v12H5zM12 2v5h4M8 10h5M8 13h5"/>',memory:'<path d="M5 3h10v15l-5-4-5 4z"/>'}[key]||'')+'</svg>';
export function mountUniversal(root,space,{api,onLoad,onResearch,toast,onBackgroundResult=async()=>{}}){
  root.__disconnectBranches?.();
  const mountToken={};root.__universalMount=mountToken;
  root.dataset.displaySpace=space.id;
  if(root.dataset.flowRoot!==(space.rootId||space.id)){delete root.dataset.flowZoom;delete root.dataset.workflowPane;delete root.dataset.evidenceCandidate;delete root.dataset.canvasInspectorOpen;delete root.dataset.canvasDock;delete root.dataset.canvasThreadOpen;root.dataset.flowRoot=space.rootId||space.id;}
  document.documentElement.classList.remove('option-dialog-open');
  if(!root.dataset.imageErrorsHandled){root.addEventListener('error',event=>{if(event.target.tagName==='IMG')event.target.hidden=true;},true);root.dataset.imageErrorsHandled='true';}
  const draft=readWorkspaceDraft(space);
  let scenarios=draft?.scenarios||decisionScenarios(space),active=draft?.activeScenarioId||(scenarios.some(s=>s.id===space.activeScenarioId)?space.activeScenarioId:'scenario-baseline'),pane=draft?.pane||root.dataset.workflowPane||'canvas',dirty=draft?.dirty||false,saving=false,panel=false,panelMode='option',composer=false,disconnect=()=>{};
  const schema=space.schema,baseline=scenarios[0],inspected=new Map(),reactions=new Map();
  const sizePrompt=input=>{if(input){input.style.height='26px';input.style.height=Math.min(90,Math.max(26,input.scrollHeight))+'px';}};
  let conditionEditor=null,editSession=null,modalEvidence=false,threadOpen=root.dataset.canvasThreadOpen==='true',compareOpen=false,compareLeft=baseline.id,compareRight=active,compareCategory='auto';
  let dockTab='conditions',dockOpen=root.dataset.canvasInspectorOpen!==undefined?root.dataset.canvasInspectorOpen==='true':innerWidth>760&&(space.canvasScenarioIds||[]).filter(id=>id!=='scenario-baseline').length<4;
  let evidenceCandidate=root.dataset.evidenceCandidate||space.candidates[0]?.id,researchDraft=draft?.researchDraft||'',workflowBusy=false,decisionDraft=draft?.decisionDraft||{candidateId:space.decision?.candidateId||'',rationale:space.decision?.rationale||''};
  let visibleIds=draft?.canvasScenarioIds||[...new Set(['scenario-baseline',...(space.canvasScenarioIds||[active])])],messages=structuredClone(space.conversation||[]),chatBusy=false,chatDraft=draft?.chatDraft||'',draftStored=true;
  const draftState=()=>({scenarios,activeScenarioId:active,canvasScenarioIds:visibleIds,dirty,pane,chatDraft,researchDraft,decisionDraft});
  const hasDraft=()=>dirty||Boolean(chatDraft||researchDraft)||decisionDraft.candidateId!==(space.decision?.candidateId||'')||decisionDraft.rationale!==(space.decision?.rationale||'');
  function persistDraft(){if(hasDraft())draftStored=writeWorkspaceDraft(space,draftState());else{clearWorkspaceDraft(space.id);draftStored=true;}}
  root.__hasUnsavedUniversal=()=>hasDraft()&&!draftStored;
  function accepted(result,{decisionSaved=false}={}){
    clearWorkspaceDraft(space.id);dirty=false;
    const pendingDecision=!decisionSaved&&(decisionDraft.candidateId!==(result.decision?.candidateId||'')||decisionDraft.rationale!==(result.decision?.rationale||''));
    if(pendingDecision||researchDraft||chatDraft)writeWorkspaceDraft(result,{...draftState(),scenarios:result.scenarios,activeScenarioId:result.activeScenarioId,canvasScenarioIds:result.canvasScenarioIds||[],dirty:false,decisionDraft:decisionSaved?{candidateId:result.decision?.candidateId||'',rationale:result.decision?.rationale||''}:decisionDraft});
  }
  let chatFocus=space.conversationState?.focus;
  const focusedField=()=>chatFocus?.scenarioId===active&&chatFocus.fields?.length===1?chatFocus.fields[0]:null;
  function setThread(open){
    threadOpen=open;root.dataset.canvasThreadOpen=String(open);
    const panel=root.querySelector('.canvas-thread');if(panel)panel.hidden=!open;
    root.querySelector('.prompt-history')?.setAttribute('aria-expanded',String(open));
    if(open)requestAnimationFrame(()=>{const list=root.querySelector('.conversation-messages');if(list)list.scrollTop=list.scrollHeight;});
  }
  function closeComparison(){compareOpen=false;render();root.querySelector('[data-compare-open]')?.focus({preventScroll:true});}
  function showPath(id){
    const seen=new Set();let node=scenarios.find(s=>s.id===id);
    while(node&&!seen.has(node.id)){seen.add(node.id);if(!visibleIds.includes(node.id))visibleIds.push(node.id);node=scenarios.find(s=>s.id===node.parentScenarioId);}
  }
  showPath(active);
  for(const scenario of scenarios)if(scenario.id!==baseline.id&&scenario.previewCandidateId&&space.candidates.some(c=>c.id===scenario.previewCandidateId))inspected.set(scenario.id,scenario.previewCandidateId);
  const current=()=>scenarios.find(s=>s.id===active)||baseline;
  const scoped=s=>space.candidates.filter(c=>(s.candidateIds||space.candidates.map(x=>x.id)).includes(c.id));
  const ranked=s=>evaluateDecision(scoped(s),s.settings,schema);
  const winner=s=>{const r=ranked(s).find(x=>x.status==='eligible');return space.candidates.find(x=>x.id===r?.id);};
  function fork(settings,name){
    if(scenarios.length>=24)throw new Error('已保存 24 个情景，可以先整理不再需要的分支。当前情况始终保留。');
    const next={id:'scenario-'+crypto.randomUUID(),parentScenarioId:active,name,settings:structuredClone(settings),candidateIds:[...(current().candidateIds||space.candidates.map(c=>c.id))]};
    scenarios=resolveScenarioInheritance([...scenarios,next],schema);active=next.id;showPath(active);dirty=true;return scenarios.find(s=>s.id===next.id);
  }
  function updateBranchSettings(id,settings,options={}){
    const result=changeScenarioSettings(scenarios,id,settings,schema,options);
    scenarios=result.scenarios;for(const changedId of result.changedIds)reactions.delete(changedId);dirty=true;
    return result.changedIds;
  }
  const sourceLink=c=>{const s=space.sources.find(s=>s.id===c.sourceId)||space.sources.find(s=>Object.values(c.facts).some(f=>f.sourceId===s.id));return s?.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(s.url).hostname)} ↗</a>`:`<span>${space.mode==='demo'?'虚构演示资料':'尚无关联来源'}</span>`;};
  function option(c,role){
    if(!c)return `<article class="u-option u-no-match"><small>${esc(role)}</small><h3>还没有符合条件的选择</h3><p>${space.candidates.length?'看看哪些条件影响了选择，或让我继续找。':'还没有取得足够的公开依据。问题和条件已经保留，可以继续研究。'}</p></article>`;
    const primary=schema.fields.find(f=>f.key===schema.layout?.primaryField)||schema.fields[0],photo=c.media?.url;
    const summaries=(schema.layout?.summaryFields||schema.fields.filter(f=>f.key!==primary.key).map(f=>f.key)).map(key=>schema.fields.find(f=>f.key===key)).filter(Boolean);
    return `<article class="u-option"><small>${esc(role)}</small>${photo?`<img src="${esc(photo)}" alt="${esc(c.name)}${space.mode==='demo'?'示意图':'的来源配图'}" loading="lazy">${c.media?.kind==='listing-photo'?'<span class="source-media-note">该房源原页图片 · 平台发布，未实地核验</span>':''}`:''}<h3>${esc(c.name)}</h3>${hasDecisionValue(c.facts[primary.key]?.value,primary)?`<span class="u-primary-label">${esc(primary.label)}</span><strong class="u-price">${esc(amount(c.facts[primary.key].value,primary))}</strong>`:''}<dl>${summaries.filter(f=>hasDecisionValue(c.facts[f.key]?.value,f)).map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(amount(c.facts[f.key].value,f))}</dd></div>`).join('')}</dl>${c.displayDetails?.length?`<details class="u-specs"><summary>更多信息</summary><dl>${c.displayDetails.map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl></details>`:''}<footer>${sourceLink(c)}${c.media?.kind==='listing-photo'?`<a href="${esc(photo)}" target="_blank" rel="noopener noreferrer">查看原图 ↗</a>`:''}<button type="button" data-u-evidence="${esc(c.id)}">查看依据</button></footer></article>`;
  }
  function applyLive(key,value,scenarioId=active,continuous=false){
    if(typeof value==='number'&&Number.isFinite(value))value=Number(value.toPrecision(12));
    const field=schema.fields.find(f=>f.key===key);if(!field)throw new Error('请选择有效的条件');
    active=scenarioId;const selected=current(),before=structuredClone(continuous&&editSession?.scenarioId===active?editSession.settings:selected.settings);
    const beforeOverrides=structuredClone(continuous&&editSession?.scenarioId===active?editSession.overrides:selected.overrides);
    const next=structuredClone(selected.settings);next.limits[key]=value;validateDecisionSettings(next,schema);
    if(JSON.stringify(next)===JSON.stringify(selected.settings))return;
    const previousRows=evaluateDecision(scoped(selected),before,schema),nextRows=evaluateDecision(scoped(selected),next,schema);
    let target=selected,affectedIds=[];
    if(selected.id===baseline.id){target=fork(next,'如果换个条件？');if(editSession)editSession.scenarioId=target.id;}
    else{affectedIds=updateBranchSettings(selected.id,next);target=current();}
    const entered=nextRows.filter(r=>r.status==='eligible'&&previousRows.find(p=>p.id===r.id)?.status!=='eligible').map(r=>r.id);
    const exited=previousRows.filter(r=>r.status==='eligible'&&nextRows.find(p=>p.id===r.id)?.status!=='eligible').map(r=>{const after=nextRows.find(x=>x.id===r.id);return {id:r.id,reason:[...(after?.reasons||[]),...(after?.missing||[])].join('；')};});
    reactions.set(target.id,{key,label:field.conditionLabel||field.label,before:amount(before.limits[key],field),after:amount(value,field),beforeSettings:before,beforeOverrides,affectedIds:affectedIds.filter(id=>id!==target.id),beforeCount:previousRows.filter(r=>r.status==='eligible').length,entered,exited});
    panel=false;if(conditionEditor)conditionEditor.scenarioId=target.id;
    render(continuous?true:'live');
  }
  function optionEvidence(candidate){
    if(!candidate)return '<p>没有关联的方案。</p>';
    const facts=schema.fields.filter(f=>candidate.facts[f.key]?.quote).map(f=>({...candidate.facts[f.key],label:f.label,value:amount(candidate.facts[f.key].value,f)}));
    const all=[...facts,...(candidate.displayDetails||[])];
    return '<section class="option-evidence">'+all.map(f=>{const source=space.sources.find(s=>s.id===f.sourceId);return '<article><h4>'+esc(f.label)+' · '+esc(f.value)+'</h4><blockquote>'+esc(f.quote)+'</blockquote>'+(source?.url?'<a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.title)+' ↗</a>':'<span>演示引用</span>')+'</article>';}).join('')+'</section>';
  }
  function closeOption(){panel=false;modalEvidence=false;render();root.querySelector('[data-tree-node="'+active+'"] [data-tree-candidate="'+inspected.get(active)+'"]')?.focus({preventScroll:true});}
  function canvas(){
    const selected=current(),rows=ranked(selected);
    const candidate=space.candidates.find(c=>c.id===inspected.get(active))||winner(selected)||space.candidates.find(c=>c.id===rows.find(r=>r.status!=='disabled')?.id);
    const row=rows.find(r=>r.id===candidate?.id);
    const reasons=row?[...row.reasons,...row.missing.map(label=>label+'缺少可用依据')]:[];
    const explanation=row&&row.status!=='eligible'?'<p class="tree-reference-note">这是已有参考方案，未作为符合条件的推荐。'+esc(reasons.join('；'))+'</p>':'';
    const tabs='<nav class="option-dialog-tabs" aria-label="方案详情视图"><button type="button" data-option-tab="overview" aria-pressed="'+!modalEvidence+'">方案信息</button><button type="button" data-option-tab="evidence" aria-pressed="'+modalEvidence+'">来源依据</button></nav>';
    const details=tabs+(modalEvidence?optionEvidence(candidate):explanation+option(candidate,'方案信息'));
    root.__flowParents=Object.fromEntries(scenarios.map(s=>[s.id,s.parentScenarioId||baseline.id]));
    return branchCanvas(space,scenarios,active,inspected,{panel,composer,details,editor:conditionEditor,reactions,visibleIds,messages,chatBusy,chatDraft,dockTab,dockOpen,threadOpen,focusField:focusedField()});
  }
  async function sendConversation(message,extra={}){
    if(chatBusy||message.length<2)return;
    const previousActive=active;
    chatDraft=message;chatBusy=true;threadOpen=true;render();
    try{
      const result=await api('/api/spaces/'+space.id+'/conversation',{method:'POST',body:JSON.stringify({message,scenarios,scenarioId:active,canvasScenarioIds:visibleIds,focusField:focusedField(),autoResearch:true,...extra})});
      chatDraft='';chatBusy=false;
      accepted(result);
      if(root.__universalMount!==mountToken||root.closest('[hidden]')){await onBackgroundResult();toast('对话已保存到原来的决策空间。');return;}
      const followedRequest=active===previousActive;
      const selectedResult=result.scenarios.find(scenario=>scenario.id===active);
      const displayed=followedRequest||!selectedResult?result:{...result,activeScenarioId:active,settings:structuredClone(selectedResult.settings),canvasScenarioIds:[...visibleIds]};
      await onLoad(displayed);
      if(followedRequest&&result.activeScenarioId!==previousActive)requestAnimationFrame(()=>{
        root.dispatchEvent(new CustomEvent('prism:focus-path',{detail:{scenarioId:result.activeScenarioId}}));
        root.querySelector('#conversation-message')?.focus({preventScroll:true});
      });
      else if(followedRequest)root.querySelector('#conversation-message')?.focus({preventScroll:true});
      if(result.nextAction?.type==='research')await onResearch(result.nextAction.jobId,{inline:true});
    }catch(error){chatBusy=false;if(root.__universalMount===mountToken&&!root.closest('[hidden]')){render();root.querySelector('#conversation-message')?.focus({preventScroll:true});}throw error;}
  }
  async function save(decision,extra={}){
    if(saving)return;saving=true;
    try{const result=await api('/api/spaces/'+space.id+'/versions',{method:'POST',body:JSON.stringify({adaptive:true,scenarios,activeScenarioId:active,canvasScenarioIds:visibleIds,...extra,...(decision?{decision}:{})})});accepted(result,{decisionSaved:Boolean(decision)});await onLoad(result);if(pane!=='canvas')root.querySelector('[data-u-pane="'+pane+'"]')?.click();toast('已保存，当前情况和旧版本都已保留。');return result;}finally{saving=false;}
  }
  async function continueResearch(request,{refresh=false}={}){
    if(workflowBusy)return;
    if(space.mode==='demo')throw new Error('演示使用虚构资料。请从首页创建真实研究。');
    workflowBusy=true;render();
    try{
      const parent=await api('/api/spaces/'+space.id+'/versions',{method:'POST',body:JSON.stringify({adaptive:true,scenarios,activeScenarioId:active,canvasScenarioIds:visibleIds})});
      const job=await api('/api/spaces/'+parent.id+(refresh?'/refresh':'/adapt'),{method:'POST',body:JSON.stringify(refresh?{adaptive:true}:{change:request,scenarios:parent.scenarios,scenarioId:active})});
      await onResearch(job.id);
    }catch(error){workflowBusy=false;render();throw error;}finally{workflowBusy=false;}
  }
  function recordedContext(){
    const context=space.decision?.context;if(!context)throw new Error('这条旧记录没有保存完整条件');
    const settings=validateDecisionSettings({limits:context.settings.limits,weights:Object.fromEntries(schema.fields.map(f=>[f.key,context.settings.weights[f.key]??0])),evidenceMode:context.settings.evidenceMode},schema);
    active=scenarios.find(s=>s.id===context.scenarioId)?.id||baseline.id;
    if(JSON.stringify(current().settings)!==JSON.stringify(settings))fork(settings,'回看当时的选择');
    showPath(active);
  }
  async function research(){
    if(space.mode==='demo'){toast('演示使用虚构资料。回到首页，输入真实需求即可开始研究。');return;}
    const job=await api('/api/spaces/'+space.id+'/explore',{method:'POST',body:JSON.stringify({adaptive:true,scenarios,scenarioId:active})});await onResearch(job.id);
  }
  function render(keepControls=false){
    persistDraft();
    root.dataset.canvasDock=dockTab;root.dataset.canvasThreadOpen=String(threadOpen);
    root.dataset.canvasInspectorOpen=String(dockOpen);
    root.dataset.workflowPane=pane;if(evidenceCandidate)root.dataset.evidenceCandidate=evidenceCandidate;
    const retainedControls=keepControls?root.querySelector('.board-controlbar'):null;
    const viewport=root.querySelector('.flow-viewport'),canvasScroll=viewport?{left:viewport.scrollLeft,top:viewport.scrollTop}:null;
    disconnect();
    document.documentElement.classList.toggle('option-dialog-open',(panel||compareOpen)&&pane==='canvas');
    const navigation=`<nav class="u-tabs" aria-label="决策工作区">${[['canvas','What-if 画布'],['evidence','资料依据'],['memory','我的判断']].map(([key,title])=>`<button type="button" data-u-pane="${key}" aria-current="${pane===key?'page':'false'}">${tabIcon(key)}${title}</button>`).join('')}</nav>`;
    const menu=`<details class="space-menu" ${dirty?'data-dirty="true"':''}><summary aria-label="空间菜单" title="空间菜单"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary><div class="space-menu-list"><button type="button" data-u-save>${dirty?'保存修改':'另存为新版本'}</button><details class="u-original-question"><summary>查看原始问题</summary><p>${esc(space.question)}</p></details><button type="button" data-u-pane="research">更多研究选项</button><hr/><button type="button" data-space-action="settings">研究设置</button><button type="button" data-space-action="jobs">研究任务</button><hr/><button type="button" class="space-delete-action" data-delete-space="${esc(space.id)}" data-delete-title="${esc(space.title)}">删除决策空间</button></div></details>`;
    const html=`<header class="u-heading"><div class="u-title"><h1 title="${esc(space.title)}">${esc(space.title)}</h1>${space.mode==='demo'?'<span class="u-demo-note" title="方案和数值均为虚构，用来体验条件变化。">虚构演示</span>':''}</div>${navigation}${menu}</header><div class="u-pane">${pane==='canvas'?canvas():pane==='evidence'?evidenceView(space,scenarios,current(),{candidateId:evidenceCandidate}):pane==='research'?researchView(space,scenarios,current(),{draft:researchDraft,busy:workflowBusy}):memoryView(space,scenarios,current(),{draft:decisionDraft})}</div>${compareOpen&&pane==='canvas'?branchComparisonView(space,scenarios,compareLeft,compareRight,compareCategory):''}`;
    if(retainedControls){
      const next=document.createElement('template');next.innerHTML=html;
      const oldDeck=root.querySelector('.tree-branch-deck'),newDeck=next.content.querySelector('.tree-branch-deck');
      if(oldDeck&&newDeck)oldDeck.replaceWith(newDeck);
      root.__flowParents=Object.fromEntries(scenarios.map(s=>[s.id,s.parentScenarioId||baseline.id]));
      disconnect=connectBranches(root);root.__disconnectBranches=disconnect;
      const chatContext=root.querySelector('#u-conversation>label'),nextContext=next.content.querySelector('#u-conversation>label');if(chatContext&&nextContext)chatContext.textContent=nextContext.textContent;
      const context=root.querySelector('.prompt-context'),freshContext=next.content.querySelector('.prompt-context');if(context&&freshContext)context.replaceWith(freshContext);
      for(const selector of ['.inspector-impact','.inspector-references']){const old=root.querySelector(selector),fresh=next.content.querySelector(selector);if(old&&fresh)old.replaceWith(fresh);}
      for(const node of root.querySelectorAll('[data-tree-node]'))node.classList.toggle('is-active',node.dataset.treeNode===active);
      root.querySelector('.tree-inspector')?.remove();
      if(keepControls==='live'){retainedControls.replaceWith(next.content.querySelector('.board-controlbar'));const save=root.querySelector('[data-u-save]');if(save)save.textContent=dirty?'保存修改':'另存为新版本';root.querySelector('.space-menu')?.toggleAttribute('data-dirty',dirty);return;}
      const selector=root.querySelector('#board-scenario');if(selector)selector.innerHTML=next.content.querySelector('#board-scenario').innerHTML;
      const hint=root.querySelector('.board-control-context>span');if(hint)hint.textContent=next.content.querySelector('.board-control-context>span').textContent;
      for(const button of retainedControls.querySelectorAll('[data-live-scenario]'))button.dataset.liveScenario=active;
      const saveButton=root.querySelector('[data-u-save]');if(saveButton)saveButton.textContent=dirty?'保存修改':'另存为新版本';root.querySelector('.space-menu')?.toggleAttribute('data-dirty',dirty);
      return;
    }
    root.innerHTML=html;
    for(const control of root.querySelectorAll('[data-live-input],[data-live-range],[data-live-condition],[data-u-weight]'))control.disabled=chatBusy;
    if(chatBusy){const hint=root.querySelector('.board-control-context>span');if(hint)hint.textContent='这条对话正在处理，条件稍后可调整；仍可切换路径查看。';}
    sizePrompt(root.querySelector('#conversation-message'));
    const thread=root.querySelector('.conversation-messages');if(thread)thread.scrollTop=thread.scrollHeight;
    const dialog=root.querySelector('.option-dialog');
    if(dialog){
      dialog.showModal();
      dialog.addEventListener('cancel',event=>{event.preventDefault();closeOption();});
      dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeOption();});
      for(const detail of dialog.querySelectorAll('.u-specs'))detail.open=true;
    }
    const comparison=root.querySelector('.branch-compare-dialog');
    if(comparison){comparison.showModal();comparison.addEventListener('cancel',e=>{e.preventDefault();closeComparison();});comparison.addEventListener('click',e=>{if(e.target!==comparison)return;const box=comparison.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)closeComparison();});}
    if(pane==='canvas')disconnect=connectBranches(root);
    if(canvasScroll)requestAnimationFrame(()=>{const view=root.querySelector('.flow-viewport');if(view){view.scrollLeft=canvasScroll.left;view.scrollTop=canvasScroll.top;}});
    root.__disconnectBranches=disconnect;
    if(panel&&panelMode==='conditions'&&root.querySelector('.u-condition-details'))root.querySelector('.u-condition-details').open=true;
    if(pane==='memory'){
      api('/api/spaces/'+space.id+'/versions').then(versions=>{if(root.dataset.displaySpace!==space.id)return;const list=root.querySelector('#u-history-list');if(list)list.innerHTML=versions.map(v=>`<button type="button" data-u-version="${v.id}" aria-current="${v.id===space.id?'true':'false'}">v${v.version} · ${esc(new Date(v.savedAt).toLocaleString('zh-CN'))}${v.id===space.id?' · 当前':''}</button>`).join('');}).catch(e=>toast(e.message));
      api('/api/spaces/'+space.id+'/diff').then(diff=>{if(root.dataset.displaySpace!==space.id)return;const target=root.querySelector('#u-version-diff');if(target)target.innerHTML=versionDiffView(diff);}).catch(()=>{const target=root.querySelector('#u-version-diff');if(target)target.textContent='暂时未能读取版本变化，可以在版本记录中重新打开。';});
    }
  }
  root.onclick=async e=>{
    const exported=e.target.closest('[data-export-workspace]');
    if(exported){e.preventDefault();try{const snapshot=exportWorkspaceSnapshot(space,draftState()),url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='prism-'+space.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){toast(error.message);}return;}
    if(e.target.id==='conversation-message'){setThread(true);return;}
    const b=e.target.closest('button');if(!b)return;
    try{
      if(b.hasAttribute('data-thread-close')){setThread(false);root.querySelector('.prompt-history')?.focus({preventScroll:true});}
      else if(b.hasAttribute('data-thread-toggle'))setThread(!threadOpen);
      else if(b.dataset.chatFocus){chatFocus={scenarioId:active,fields:[b.dataset.chatFocus]};threadOpen=true;render();root.querySelector('#conversation-message')?.focus({preventScroll:true});}
      else if(b.dataset.chatClear){const field=schema.fields.find(field=>field.key===b.dataset.chatClear);if(field)await sendConversation('取消'+(field.conditionLabel||field.label)+'限制');}
      else if(b.dataset.chatChoice)await sendConversation(b.textContent.trim(),{choiceId:b.dataset.chatChoice,clarificationId:b.dataset.clarificationId});
      else if(b.dataset.chatUndo)await sendConversation('撤销这次修改',{undoActionId:b.dataset.chatUndo});
      else if(b.dataset.compareOpen){
        const selected=scenarios.find(s=>s.id===b.dataset.compareOpen)||current();
        compareLeft=selected.parentScenarioId||baseline.id;compareRight=selected.id===baseline.id?(scenarios[1]?.id||baseline.id):selected.id;
        compareCategory='auto';compareOpen=true;threadOpen=false;panel=false;render();
      }
      else if(b.hasAttribute('data-compare-close'))closeComparison();
      else if(b.hasAttribute('data-compare-swap')){[compareLeft,compareRight]=[compareRight,compareLeft];render();}
      else if(b.dataset.compareCategory){compareCategory=b.dataset.compareCategory;render();root.querySelector('[data-compare-category="'+compareCategory+'"]')?.focus({preventScroll:true});}
      else if(b.hasAttribute('data-compare-research')){active=compareRight;showPath(active);compareOpen=false;threadOpen=true;chatDraft='请沿当前分支继续查找更多有公开依据的具体方案，保留 '+summarizeConditions(current().settings,schema)+'，补充目前研究范围以外的可能性。';render();root.querySelector('#conversation-message')?.focus({preventScroll:true});}
      else if(b.dataset.spaceAction){root.querySelector('.space-menu').open=false;document.getElementById(b.dataset.spaceAction==='settings'?'settings-button':'jobs-button')?.click();}
      else if(b.dataset.evidenceCandidate){evidenceCandidate=b.dataset.evidenceCandidate;render();}
      else if(b.dataset.confirmFact){
        const c=space.candidates.find(c=>c.id===b.dataset.reviewCandidate),row=c&&evidenceRows(space,c).find(r=>r.field.key===b.dataset.confirmFact),o=row?.observations[Number(b.dataset.reviewObservation)];
        if(!o)throw new Error('请选择保存的引用');evidenceCandidate=c.id;root.dataset.evidenceCandidate=c.id;
        await save(undefined,{reviews:[{action:'confirm',candidateId:c.id,key:row.field.key,value:o.value,sourceId:o.sourceId,quote:o.quote}]});
      }
      else if(b.dataset.withdrawFact)await save(undefined,{reviews:[{action:'withdraw',candidateId:b.dataset.reviewCandidate,key:b.dataset.withdrawFact}]});
      else if(b.dataset.researchGap){
        const c=space.candidates.find(c=>c.id===b.dataset.gapCandidate),field=schema.fields.find(f=>f.key===b.dataset.researchGap);
        researchDraft=`保留当前目标和条件，继续核对「${c?.name}」的${field?.label}。请找同一具体方案的公开原文，区分配置、时间和来源差异。`.slice(0,300);pane='research';render();root.querySelector('#followup-message')?.focus({preventScroll:true});
      }
      else if(b.dataset.researchPrompt){
        const missing=[...new Set(scoped(current()).flatMap(c=>evidenceRows(space,c).filter(r=>['missing','unsupported','conflict'].includes(r.status)&&(current().settings.weights[r.field.key]>0||current().settings.limits[r.field.key]!==null)).map(r=>r.field.label)))];
        researchDraft={alternatives:'保留当前目标和条件，继续寻找更多有公开来源和具体参数的备选方案，避免重复已收集的配置。',evidence:'保留当前目标和条件，重点补齐或核对'+(missing.join('、')||'关键参数与引用')+'。请绑定到同一具体方案，不猜测缺失数值。',independent:'保留当前目标和条件，补充与已收集网站不同的公开独立来源，核对同一具体方案的参数；发现分歧时保留双方引文。'}[b.dataset.researchPrompt];render();root.querySelector('#followup-message')?.focus({preventScroll:true});
      }
      else if(b.hasAttribute('data-refresh-evidence'))await continueResearch('',{refresh:true});
      else if(b.hasAttribute('data-recorded-context')){recordedContext();pane='canvas';render();}
      else if(b.hasAttribute('data-decision-research')){if(space.decision?.context)recordedContext();researchDraft=`保留当时的条件，继续核对「${space.decision?.candidateName||'当前考虑的方案'}」的公开参数和引用，说明新资料是否改变之前的判断。`.slice(0,300);pane='research';render();}
      else if(b.dataset.dockView){dockTab=b.dataset.dockView;dockOpen=true;render();}
      else if(b.hasAttribute('data-toggle-inspector')){dockOpen=!dockOpen;render();}
      else if(b.dataset.liveCondition){editSession=null;applyLive(b.dataset.liveCondition,JSON.parse(b.dataset.liveValue),b.dataset.liveScenario);}
      else if(b.dataset.tuneCondition){active=b.dataset.tuneScenario;dockTab='conditions';dockOpen=true;render();root.querySelector('[data-live-input="'+b.dataset.tuneCondition+'"]')?.focus({preventScroll:true});}
      else if(b.dataset.undoCondition){const change=reactions.get(b.dataset.undoCondition),branch=scenarios.find(s=>s.id===b.dataset.undoCondition);if(change&&branch&&branch.id!==baseline.id){updateBranchSettings(branch.id,change.beforeSettings,{overrides:change.beforeOverrides});reactions.delete(branch.id);active=branch.id;render('live');}}
      else if(b.dataset.treeCondition){active=b.dataset.treeCondition;dockTab='conditions';dockOpen=true;panel=false;composer=false;render();}
      else if(b.dataset.treeOpen){active=b.dataset.treeOpen;if(b.dataset.treeCandidate)inspected.set(active,b.dataset.treeCandidate);panel=true;modalEvidence=false;panelMode='option';composer=false;render();}
      else if(b.hasAttribute('data-tree-compose')){panel=false;threadOpen=true;chatDraft=chatDraft||'如果';render();const input=root.querySelector('#conversation-message');input?.focus({preventScroll:true});input?.setSelectionRange(chatDraft.length,chatDraft.length);}
      else if(b.dataset.showBranch){showPath(b.dataset.showBranch);active=b.dataset.showBranch;dockTab='conditions';dirty=true;render();}
      else if(b.dataset.hideBranch){
        const hidden=new Set([b.dataset.hideBranch]);
        for(let count=0;count<scenarios.length;count++)for(const s of scenarios)if(hidden.has(s.parentScenarioId))hidden.add(s.id);
        visibleIds=visibleIds.filter(id=>!hidden.has(id));
        if(hidden.has(active))active=scenarios.find(s=>s.id===b.dataset.hideBranch)?.parentScenarioId||baseline.id;
        showPath(active);dirty=true;panel=false;render();
      }
      else if(b.dataset.chatPath){
        if(!scenarios.some(s=>s.id===b.dataset.chatPath))return;
        showPath(b.dataset.chatPath);active=b.dataset.chatPath;pane='canvas';threadOpen=false;panel=false;compareOpen=false;render();
        requestAnimationFrame(()=>root.dispatchEvent(new CustomEvent('prism:focus-path',{detail:{scenarioId:active}})));
      }
      else if(b.dataset.chatFrom){showPath(b.dataset.chatFrom);active=b.dataset.chatFrom;threadOpen=true;render();root.querySelector('#conversation-message')?.focus({preventScroll:true});}
      else if(b.dataset.chatResearch){const job=await api('/api/spaces/'+space.id+'/adapt',{method:'POST',body:JSON.stringify({change:b.dataset.chatResearch,scenarios,scenarioId:active})});await onResearch(job.id);}
      else if(b.hasAttribute('data-tree-close'))closeOption();
      else if(b.dataset.optionTab){modalEvidence=b.dataset.optionTab==='evidence';render();}
      else if(b.dataset.uInspect){inspected.set(active,b.dataset.uInspect);current().previewCandidateId=b.dataset.uInspect;dirty=true;render();}
      else if(b.dataset.uPane){pane=b.dataset.uPane;render();}
      else if(b.dataset.uSelect){active=b.dataset.uSelect;render();}
      else if(b.dataset.uEvidence){if(panel){modalEvidence=true;render();return;}evidenceCandidate=b.dataset.uEvidence;pane='evidence';render();}
      else if(b.hasAttribute('data-u-save'))await save();
      else if(b.hasAttribute('data-u-research'))await research();
      else if(b.hasAttribute('data-u-retry')){
        const job=await api('/api/spaces/'+space.id+'/adapt',{method:'POST',body:JSON.stringify({change:'保留我的目标和条件，换一批来源继续寻找有原文参数的具体方案。避免重复不可读的页面。',scenarios,scenarioId:active})});await onResearch(job.id);
      }
      else if(b.hasAttribute('data-u-remove')){if(active===baseline.id)return;scenarios=scenarios.filter(s=>s.id!==active);active=baseline.id;dirty=true;render();}
      else if(b.dataset.uVersion)await onLoad(await api('/api/spaces/'+b.dataset.uVersion));
      else if(b.dataset.uSuggest){const f=schema.fields.find(f=>f.key===b.dataset.uSuggest),next=structuredClone(current().settings);next.limits[f.key]+=f.step;fork(next,`如果${f.label}${f.direction===1?'至少':'放宽到'} ${amount(next.limits[f.key],f)}？`);render();}
    }catch(error){toast(error.message);}
  };
  root.onsubmit=async e=>{
    e.preventDefault();const form=e.target;
    try{
      if(form.id==='u-followup'){
        researchDraft=form.querySelector('textarea').value.trim();if(researchDraft.length<2)throw new Error('请说明想继续研究的问题');await continueResearch(researchDraft);
      }else if(form.id==='u-conversation'){
        const message=form.querySelector('textarea').value.trim();if(message.length<2)return;
        await sendConversation(message);
      }else if(form.id==='u-whatif'){
        const text=form.querySelector('input').value.trim();
        if(space.mode!=='demo'){
          const job=await api('/api/spaces/'+space.id+'/adapt',{method:'POST',body:JSON.stringify({change:text,scenarios,scenarioId:active})});await onResearch(job.id);return;
        }
        const parsed=parseDecisionChange(text,current().settings,schema);
        if(!parsed.changed.length)return toast('这个演示只调整已展示的条件。开始一次真实研究，助手就能分析新的关注点。');
        fork(parsed.settings,text);composer=false;panel=false;render();
      }else if(form.id==='u-conditions'){
        const next=structuredClone(current().settings),values=new FormData(form);
        for(const f of schema.fields){if(!values.has(f.key))continue;const v=values.get(f.key);next.limits[f.key]=v===''?null:f.type==='boolean'?v==='true':f.type==='enum'?v:Number(v);}
        validateDecisionSettings(next,schema);
        if(JSON.stringify(next)===JSON.stringify(current().settings))return;
        if(active===baseline.id)fork(next,'如果换成这组条件？');else updateBranchSettings(active,next);render();
      }else if(form.id==='u-record'){const values=new FormData(form);await save({candidateId:values.get('candidateId')||null,rationale:values.get('rationale')||''});}
    }catch(error){toast(error.message);}
  };
  root.onpointerdown=e=>{if(e.target.id==='conversation-message')setThread(true);else if(threadOpen&&!e.target.closest('.canvas-prompt'))setThread(false);if(!e.target.closest('.space-menu')){const menu=root.querySelector('.space-menu');if(menu)menu.open=false;}if(e.target.matches('[data-live-range]'))editSession={scenarioId:active,settings:structuredClone(current().settings),overrides:structuredClone(current().overrides)};};
  root.onkeydown=e=>{if(e.key==='Escape'&&threadOpen&&!compareOpen&&!panel){setThread(false);root.querySelector('.prompt-history')?.focus({preventScroll:true});}if(e.key==='Escape'){const menu=root.querySelector('.space-menu[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();}}if(e.target.id==='conversation-message'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.target.form.requestSubmit();}};
  root.onfocusin=e=>{if(e.target.id==='conversation-message')setThread(true);if(e.target.matches('[data-live-input]')){chatFocus={scenarioId:active,fields:[e.target.dataset.liveInput]};editSession={scenarioId:active,settings:structuredClone(current().settings),overrides:structuredClone(current().overrides)};}};
  root.oninput=e=>{
    if(e.target.id==='followup-message'){researchDraft=e.target.value;persistDraft();return;}
    if(e.target.closest('#u-record')&&e.target.name==='rationale'){decisionDraft.rationale=e.target.value;persistDraft();return;}
    if(e.target.id==='conversation-message'){chatDraft=e.target.value;sizePrompt(e.target);persistDraft();return;}
    const key=e.target.dataset.liveRange||e.target.dataset.liveInput;if(!key)return;
    try{const value=e.target.value===''?null:Number(e.target.value);applyLive(key,value,active,true);const label=root.querySelector('[data-live-input="'+key+'"]');if(label&&e.target.dataset.liveRange)label.value=value??'';const range=root.querySelector('[data-live-range="'+key+'"]');if(range&&e.target.dataset.liveInput){if(value!==null){range.min=Math.min(Number(range.min),value);range.max=Math.max(Number(range.max),value);}range.value=value??range.min;}for(const button of root.querySelectorAll('.board-controlbar [data-live-condition="'+key+'"]')){const selected=JSON.parse(button.dataset.liveValue)===value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}}
    catch(error){toast(error.message);}
  };
  root.onchange=e=>{
    if(e.target.dataset.compareSide){const side=e.target.dataset.compareSide;if(side==='left')compareLeft=e.target.value;else compareRight=e.target.value;render();root.querySelector('[data-compare-side="'+side+'"]')?.focus({preventScroll:true});return;}

    if(e.target.matches('[data-workflow-scenario]')){active=e.target.value;showPath(active);render();return;}
    if(e.target.closest('#u-record')&&e.target.name==='candidateId'){decisionDraft.candidateId=e.target.value;persistDraft();return;}
    if(e.target.matches('[data-live-range],[data-live-input]')){
      editSession=null;
      if(e.target.matches('[data-live-range]'))render('live');
      else{
        // Preserve pending pointer targets when a number input blurs. Rebuilding
        // the deck or controls here would swallow the next option/preset click.
        const key=e.target.dataset.liveInput,value=current().settings.limits[key],buttons=[...root.querySelectorAll('[data-live-condition="'+key+'"]')];
        if(!buttons.some(b=>JSON.parse(b.dataset.liveValue)===value)&&buttons.length){const button=buttons[0].cloneNode(true);button.dataset.liveValue=JSON.stringify(value);button.dataset.liveScenario=active;button.textContent=value===null?'不限':Number(value).toLocaleString('zh-CN');button.classList.add('selected');button.setAttribute('aria-pressed','true');buttons[0].parentNode.append(button);}
      }
      return;
    }

    if(e.target.matches('[data-board-scenario]')){active=e.target.value;showPath(active);panel=false;render();return;}
    if(!e.target.dataset.uWeight)return;
    try{const next=structuredClone(current().settings);next.weights[e.target.dataset.uWeight]=Number(e.target.value);validateDecisionSettings(next,schema);if(active===baseline.id)fork(next,'如果改变偏好？');else updateBranchSettings(active,next);render();}catch(error){toast(error.message);render();}
  };
  render();
}
