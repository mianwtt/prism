import {liveControls} from '/live-conditions.mjs';
import {evaluateDecision,formatDecisionValue,summarizeConditions} from '/decision-schema.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const glyph=name=>`<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">${name==='fork'?'<path d="M6 16h7m0 0c6 0 5-9 13-9m-13 9c6 0 5 9 13 9"/><path d="m22 4 5 3-5 3m0 12 5 3-5 3"/>':name==='search'?'<circle cx="14" cy="14" r="8"/><path d="m20 20 7 7"/>':'<rect x="5" y="5" width="22" height="22" rx="4"/><circle cx="12" cy="12" r="2"/><path d="m7 24 7-7 4 4 3-3 4 6"/>'}</svg>`;
export function friendlyCondition(field,value,before){
  const label=field.conditionLabel||field.label;
  if(value===null)return `不限制${label}`;
  if(field.type==='boolean')return `${label}：${value?'是':'否'}`;
  if(field.type==='enum')return `${label}改为${value}`;
  return field.direction===1?`${label}${before!==null&&value<before?'放宽到至少':'至少'}${formatDecisionValue(value,field)}`:before!==null&&value>before?`${label}放宽到${formatDecisionValue(value,field)}`:`${label}不超过${formatDecisionValue(value,field)}`;
}
export function branchCanvas(space,scenarios,active,inspected,{panel=false,details='',reactions=new Map(),visibleIds=[],messages=[],chatBusy=false,chatDraft='',dockTab='conditions',dockOpen=true,threadOpen=false}={}){
  const schema=space.schema,baseline=scenarios[0],selected=scenarios.find(s=>s.id===active)||baseline;
  const pool=s=>space.candidates.filter(c=>(s.candidateIds||space.candidates.map(c=>c.id)).includes(c.id));
  const cache=new Map(),ranks=s=>{if(!cache.has(s.id))cache.set(s.id,evaluateDecision(pool(s),s.settings,schema));return cache.get(s.id);};
  const count=s=>ranks(s).filter(r=>r.status==='eligible').length,byId=new Map(scenarios.map(s=>[s.id,s])),requestedIds=new Set(visibleIds),activePath=new Set();
  function ancestors(id,set){const seen=new Set();let s=byId.get(id);while(s&&!seen.has(s.id)){seen.add(s.id);set.add(s.id);s=byId.get(s.parentScenarioId);}}
  for(const id of [...requestedIds])ancestors(id,requestedIds);ancestors(active,activePath);
  const requested=scenarios.slice(1).filter(s=>requestedIds.has(s.id)),viable=new Map();
  function hasViableResult(s){if(viable.has(s.id))return viable.get(s.id);const result=count(s)>0||requested.some(child=>child.parentScenarioId===s.id&&hasViableResult(child));viable.set(s.id,result);return result;}
  const visible=requested.filter(s=>!s.parentScenarioId||s.parentScenarioId===baseline.id||count(byId.get(s.parentScenarioId)||baseline)>0||hasViableResult(s)||activePath.has(s.id)),hiddenEmpty=requested.filter(s=>!visible.includes(s));
  function hiddenBelow(id){return hiddenEmpty.filter(s=>{const chain=new Set();ancestors(s.id,chain);return chain.has(id);}).length;}
  const title=s=>{
    if(s.id===baseline.id)return '当前情况';
    const parent=scenarios.find(p=>p.id===s.parentScenarioId)||baseline;
    const changes=schema.fields.filter(f=>s.settings.limits[f.key]!==parent.settings.limits[f.key]);
    return changes.length?'如果'+changes.map(f=>friendlyCondition(f,s.settings.limits[f.key],parent.settings.limits[f.key])).join('，')+'？':s.name;
  },palette=['#b69760','#739fc4','#9a86b5','#6aa595','#c78d83'];
  function photo(row,s,reference=false){
    const c=space.candidates.find(c=>c.id===row.id);
    return `<button type="button" class="tree-choice ${reference?'tree-reference-choice':''} ${reactions.get(s.id)?.entered.includes(row.id)?'just-entered':''}" data-tree-open="${esc(s.id)}" data-tree-candidate="${esc(c.id)}" title="${esc(c.name)}" aria-label="查看${esc(c.name)}的详情"><span class="node-face">${c.media?.url?`<img src="${esc(c.media.url)}" alt="${esc(c.name)}" loading="lazy">`:''}${glyph('option')}</span><strong data-tree-name>${esc(c.name)}</strong></button>`;
  }
  function result(s,original=false){
    const rows=ranks(s),eligible=rows.filter(r=>r.status==='eligible');
    return `<article class="tree-node ${original?'tree-origin':'tree-branch'} ${s.id===active?'is-active':''}" data-tree-node="${esc(s.id)}" data-matched-count="${eligible.length}"><header class="tree-group-heading">${original?`<button class="tree-scenario" type="button" data-tree-condition="${esc(s.id)}" title="${esc(summarizeConditions(s.settings,schema))}">当前情况</button><small class="board-limits">${esc(summarizeConditions(s.settings,schema))}</small>`:''}<span class="tree-group-count">${eligible.length} 个${original?'当前选择':'匹配方案'}</span></header><div class="tree-candidates" data-eligible-count="${eligible.length}">${eligible.map(r=>photo(r,s)).join('')}</div>${eligible.length?'':`<div class="tree-no-eligible"><span>○</span><small>${rows.length?'暂无匹配':'尚无具体方案'}</small><button type="button" data-tree-condition="${esc(s.id)}">调整条件</button>${hiddenBelow(s.id)?`<small class="empty-followups" title="这些分支仍保留在分支记录中，可随时打开调整">已收起 ${hiddenBelow(s.id)} 条空结果分支</small>`:''}</div>`}</article>`;
  }
  function condition(s,index){
    const parent=scenarios.find(p=>p.id===s.parentScenarioId)||baseline,changes=schema.fields.filter(f=>parent.settings.limits[f.key]!==s.settings.limits[f.key]);
    const first=changes[0]||schema.fields.find(f=>s.overrides?.limits.includes(f.key)),extra=(s.candidateIds||[]).filter(id=>!(parent.candidateIds||[]).includes(id)).length;
    const shown=changes.length?changes.slice(0,2):first?[first]:[],relaxed=changes.length===1&&first&&parent.settings.limits[first.key]!==null&&(s.settings.limits[first.key]===null||(first.type||'number')==='number'&&(first.direction===1?s.settings.limits[first.key]<parent.settings.limits[first.key]:s.settings.limits[first.key]>parent.settings.limits[first.key]));
    const label=shown.length?shown.map(f=>f.conditionLabel||f.label).join(' / '):extra?'继续研究':'另一种取舍',value=shown.length?shown.map(f=>`<span>${esc(formatDecisionValue(s.settings.limits[f.key],f))}</span>`).join(''):'扩展选择';
    const full=changes.map(f=>friendlyCondition(f,s.settings.limits[f.key],parent.settings.limits[f.key])).join('，')||s.name;
    const recovery=count(parent)===0&&count(s)>0;
    return `<section class="flow-condition ${s.id===active?'is-active':''}" data-flow-condition="${esc(s.id)}" data-color="${palette[index%palette.length]}"><button type="button" class="condition-node" data-tree-condition="${esc(s.id)}" aria-label="调整分支：${esc(full)}" title="${esc(full)}"><span class="node-face">${glyph(extra&&!changes.length?'search':'fork')}</span><small>${changes.length===0&&first?'保持':relaxed?'放宽':'如果'}${esc(label)}</small><strong>${value}${changes.length>2?'…':''}</strong></button>${recovery?`<span class="node-recovery">${extra?'新增记录后有匹配':relaxed?`从 ${esc(formatDecisionValue(parent.settings.limits[first.key],first))} 放宽`:'改条件后恢复匹配'}</span>`:''}${extra?`<span class="node-research">含 ${extra} 个新增方案</span>`:''}</section>`;
  }
  const rows=ranks(selected),eligible=rows.filter(r=>r.status==='eligible'),other=rows.filter(r=>!['eligible','disabled'].includes(r.status)),reaction=reactions.get(active);
  const impact=reaction?`<div class="live-impact" role="status"><strong>${esc(reaction.label)} ${esc(reaction.before)} → ${esc(reaction.after)}</strong><span>${reaction.beforeCount} → ${eligible.length} 个可选 · ${reaction.entered.length} 个进入 · ${reaction.exited.length} 个退出</span>${reaction.affectedIds?.length?`<span>已联动 ${reaction.affectedIds.length} 条后续分支</span>`:''}<button type="button" data-undo-condition="${esc(active)}">撤销</button></div>`:'';
  const references=other.length?`<details class="tree-excluded"><summary>${other.length} 个未匹配方案</summary>${other.map(row=>`<div class="inspector-reference">${photo(row,selected,true)}<small>${esc([...row.reasons,...row.missing.map(f=>f+'缺少依据')].join('；'))}</small></div>`).join('')}</details>`:'';
  const exits=reaction?.exited.length?`<div class="live-exits">${reaction.exited.map(row=>`<span>${esc(space.candidates.find(c=>c.id===row.id)?.name)} · ${esc(row.reason)}</span>`).join('')}</div>`:'';
  const history=scenarios.slice(1).filter(s=>!visible.includes(s));
  const conversation=`<section class="conversation-panel canvas-thread" aria-label="完整对话记录" ${threadOpen?'':'hidden'}><header><strong>对话记录</strong><button type="button" data-thread-close aria-label="收起对话记录">×</button></header><div class="conversation-messages" aria-live="polite"><article class="chat-message initial-request"><small>最初的问题</small><p>${esc(space.question)}</p></article>${messages.map(m=>`<article class="chat-message ${m.role}"><small>${m.role==='user'?'你':'Prism'}</small><p>${esc(m.content)}</p>${m.effect?`<span class="chat-effect">${esc(m.effect)}</span>`:''}${m.scenarioId&&scenarios.some(s=>s.id===m.scenarioId)?`<button type="button" data-chat-from="${esc(m.scenarioId)}">查看这条路径 ↗</button>`:''}${m.researchRequest?`<button type="button" data-chat-research="${esc(m.researchRequest)}">继续查找资料 ↗</button>`:''}</article>`).join('')}${!messages.length?'<p class="thread-empty">可以从这个问题继续聊。对话与原始资料会一起保留。</p>':''}${chatBusy?'<p class="chat-thinking" role="status">正在结合当前路径思考…</p>':''}</div></section>`;
  const prompt=`<div class="canvas-prompt">${conversation}<form id="u-conversation"><label for="conversation-message">${esc(active===baseline.id?'和 Prism 继续聊聊':title(selected))}</label><textarea id="conversation-message" rows="1" maxlength="1500" placeholder="问问 Prism，或试一个「如果」…" required ${chatBusy?'disabled':''}>${esc(chatDraft)}</textarea><div class="prompt-send"><button class="primary" type="submit" aria-label="发送消息" title="发送消息 · Enter" ${chatBusy?'disabled':''}>${chatBusy?'思考中':'发送 ↑'}</button></div></form><button class="prompt-add" type="button" data-tree-compose aria-label="新分支" title="试一个新的 What-if">＋</button><button class="prompt-history" type="button" data-thread-toggle aria-expanded="${threadOpen}" aria-label="打开对话记录" title="打开对话记录"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h7"/></svg></button></div>`;
  return `<section class="decision-studio compact-studio" data-inspector-open="${dockOpen}"><section class="branch-workspace flow-workspace compact-stage"><header class="tree-toolbar"><div class="flow-tools">${scenarios.length>1?`<button type="button" data-compare-open="${esc(active)}" title="对比任意两条分支" aria-label="对比分支"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h6v14H4zM14 5h6v14h-6M10 9h4m-4 6h4"/></svg><span>对比</span></button>`:''}<button type="button" data-toggle-inspector aria-label="${dockOpen?'收起面板':'调整条件'}" title="${dockOpen?'收起面板':'调整条件'}" aria-pressed="${dockOpen}"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></svg><span>条件</span></button><details class="flow-history"><summary aria-label="分支记录" title="分支记录"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary><div class="branch-library">${history.map(s=>`<button type="button" data-show-branch="${esc(s.id)}">＋ ${esc(s.name)}</button>`).join('')||'<small>已展开所有分支</small>'}</div></details></div></header><div class="tree-scroll flow-viewport" tabindex="0" aria-label="可平移缩放的 What-if 画布"><div class="tree-scene flow-scene"><svg class="flow-edges" aria-hidden="true"><g/></svg><div class="tree-origin-column">${result(baseline,true)}</div><div class="tree-branch-deck">${visible.map((s,i)=>`<div class="flow-row" data-flow-row="${esc(s.id)}">${condition(s,i)}${result(s)}</div>`).join('')}${!visible.length?'<button class="tree-add" type="button" data-tree-compose><span class="node-face">＋</span><strong>如果换个条件？</strong></button>':''}</div></div></div>${prompt}<footer class="flow-footer"><div class="canvas-view-controls"><button type="button" data-flow-zoom="out" aria-label="缩小画布" title="缩小画布">−</button><span data-flow-scale>100%</span><button type="button" data-flow-zoom="in" aria-label="放大画布" title="放大画布">＋</button><button type="button" data-flow-zoom="fit" aria-label="适应画布" title="适应画布"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></button></div></footer></section><aside class="canvas-inspector"><nav class="inspector-tabs" aria-label="画布侧栏"><strong>调整条件</strong><button type="button" data-toggle-inspector aria-label="收起侧栏">×</button></nav><section class="inspector-conditions"><div class="board-controlbar" aria-label="调整 What-if 条件"><div class="board-control-context"><label for="board-scenario">${active===baseline.id?'当前情况':'正在编辑'}</label><select id="board-scenario" data-board-scenario>${scenarios.map(s=>`<option value="${esc(s.id)}" ${s.id===active?'selected':''}>${esc(title(s))}</option>`).join('')}</select><span>${active===baseline.id?'试一个新条件，原始情况会保留。':'未单独修改的条件会同步到后续分支。'}</span></div>${liveControls(schema,selected,baseline,{candidates:pool(selected),scenarios})}</div><div class="inspector-impact">${impact}</div><div class="inspector-references">${references}${exits}</div><div class="path-actions"><button type="button" data-chat-from="${esc(active)}">从这里继续对话 ↗</button>${active!==baseline.id?`<button type="button" data-hide-branch="${esc(active)}" aria-label="收起这条分支">收起分支</button>`:''}</div></section></aside></section>${panel?`<dialog class="tree-inspector option-dialog" aria-label="方案详情"><header><div><small>${esc(title(selected))}</small><h3>${esc(space.candidates.find(c=>c.id===inspected.get(active))?.name||selected.name)}</h3></div><button type="button" data-tree-close aria-label="关闭方案详情">×</button></header><div class="tree-inspector-content">${details}</div></dialog>`:''}`;
}
export function connectBranches(root){
  const viewport=root.querySelector('.flow-viewport'),scene=root.querySelector('.flow-scene'),svg=root.querySelector('.flow-edges');
  if(!viewport||!scene||!svg)return ()=>{};
  let autoFit=!Number(root.dataset.flowZoom),zoom=Number(root.dataset.flowZoom)||1,drag=null;
  function layout(){
    const origin=scene.querySelector('.tree-origin-column'),rows=[...scene.querySelectorAll('.flow-row')],nodes=new Map(rows.map(row=>[row.dataset.flowRow,row]));
    const children=new Map([['scenario-baseline',[]]]),depths=new Map([['scenario-baseline',0]]),widths=[origin.offsetWidth],padding=36,gap=52;
    for(const row of rows){row.style.marginLeft='0px';const id=row.dataset.flowRow,parent=nodes.has(root.__flowParents?.[id])?root.__flowParents[id]:'scenario-baseline';if(!children.has(parent))children.set(parent,[]);children.get(parent).push(id);}
    function depth(id,seen=new Set()){
      if(depths.has(id))return depths.get(id);if(seen.has(id))return 1;seen.add(id);
      const parent=nodes.has(root.__flowParents?.[id])?root.__flowParents[id]:'scenario-baseline',value=depth(parent,seen)+1;
      depths.set(id,value);return value;
    }
    for(const row of rows){const d=depth(row.dataset.flowRow);widths[d]=Math.max(widths[d]||0,row.offsetWidth);}
    const columns=[padding];for(let i=1;i<widths.length;i++)columns[i]=columns[i-1]+widths[i-1]+48;
    const spans=new Map();
    function span(id){
      const own=id==='scenario-baseline'?origin.offsetHeight:nodes.get(id).offsetHeight,ids=children.get(id)||[];
      const result=Math.max(own,ids.reduce((sum,child)=>sum+span(child),0)+Math.max(0,ids.length-1)*gap);spans.set(id,result);return result;
    }
    const total=span('scenario-baseline');
    function place(id,top){
      const node=id==='scenario-baseline'?origin:nodes.get(id),height=node.offsetHeight;
      node.style.left=columns[depths.get(id)||0]+'px';node.style.top=padding+top+(spans.get(id)-height)/2+'px';
      const ids=children.get(id)||[],length=ids.reduce((sum,child)=>sum+spans.get(child),0)+Math.max(0,ids.length-1)*gap;
      let next=top+(spans.get(id)-length)/2;for(const child of ids){place(child,next);next+=spans.get(child)+gap;}
    }
    place('scenario-baseline',0);
    const empty=scene.querySelector('.tree-add');if(empty){empty.style.left=padding+origin.offsetWidth+84+'px';empty.style.top=padding+total/2-55+'px';}
    scene.style.width=(rows.length?columns.at(-1)+widths.at(-1)+padding:padding*2+origin.offsetWidth+244)+'px';
    scene.style.height=total+padding*2+'px';
  }
  function draw(){
    layout();
    if(autoFit){zoom=Math.max(viewport.clientWidth<600?.8:.65,Math.min(1,(viewport.clientWidth-32)/scene.offsetWidth,(viewport.clientHeight-24)/scene.offsetHeight));autoFit=false;}
    scene.style.zoom=zoom;root.dataset.flowZoom=zoom;
    const scale=root.querySelector('[data-flow-scale]');if(scale)scale.textContent=Math.round(zoom*100)+'%';
    const box=scene.getBoundingClientRect(),paths=[];
    const point=(el,end)=>{const r=el.getBoundingClientRect();return {x:(r.left-box.left+(end?r.width:0))/zoom,y:(r.top-box.top+r.height/2)/zoom};};
    let edgeAttributes='';
    const line=(a,b,color)=>{const mid=a.x+(b.x-a.x)*.5;paths.push(`<path ${edgeAttributes} d="M${a.x},${a.y} C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}" stroke="${color}"/>`);};
    for(const row of scene.querySelectorAll('.flow-row')){
      const condition=row.querySelector('.flow-condition'),face=condition.querySelector('.node-face'),result=row.querySelector('[data-tree-node]'),color=condition.dataset.color;
      const parent=scene.querySelector('[data-tree-node="'+(root.__flowParents?.[row.dataset.flowRow]||'scenario-baseline')+'"]')||scene.querySelector('.tree-origin');
      edgeAttributes=`data-flow-edge="${esc(row.dataset.flowRow)}" data-flow-state="${Number(parent.dataset.matchedCount)===0?Number(result.dataset.matchedCount)>0?'recovery':'empty':'matched'}"`;
      line(point(parent,true),point(face,false),color);
      const targets=[...result.querySelectorAll(':scope > .tree-candidates .node-face')];
      if(targets.length){
        const groups=new Map(),start=point(face,true),port=point(result,false),rail=port.x-25;
        line(start,{x:rail,y:start.y},color);
        for(const target of targets){const r=target.getBoundingClientRect(),top=(r.top-box.top)/zoom,key=Math.round(top);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({x:(r.left-box.left+r.width/2)/zoom,top});}
        for(const nodes of groups.values()){
          const y=nodes[0].top-13,last=Math.max(...nodes.map(n=>n.x));
          paths.push(`<path ${edgeAttributes} d="M${rail},${start.y} L${rail},${y} L${last},${y}" stroke="${color}"/>`);
          for(const n of nodes)paths.push(`<path ${edgeAttributes} d="M${n.x},${y} L${n.x},${n.top}" stroke="${color}"/>`);
        }
      }else line(point(face,true),point(result,false),color);
    }
    svg.setAttribute('width',scene.scrollWidth);svg.setAttribute('height',scene.scrollHeight);svg.querySelector('g').innerHTML=paths.join('');
  }
  const click=e=>{const b=e.target.closest('button[data-flow-zoom]');if(!b)return;if(b.dataset.flowZoom==='fit')zoom=Math.max(.35,Math.min(1,(viewport.clientWidth-32)/scene.scrollWidth,(viewport.clientHeight-20)/scene.scrollHeight));else zoom=Math.max(.35,Math.min(1.6,zoom+(b.dataset.flowZoom==='in'?.1:-.1)));draw();};
  const down=e=>{if(e.button!==0||e.target.closest('button,input,select,textarea,a,details'))return;drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-panning');};
  const move=e=>{if(drag){viewport.scrollLeft=drag.left-(e.clientX-drag.x);viewport.scrollTop=drag.top-(e.clientY-drag.y);}};
  const up=()=>{drag=null;viewport.classList.remove('is-panning');};
  const wheel=e=>{if(e.ctrlKey){e.preventDefault();zoom=Math.max(.35,Math.min(1.6,zoom+(e.deltaY>0?-.05:.05)));draw();}};
  root.addEventListener('click',click);viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',up);viewport.addEventListener('wheel',wheel,{passive:false});
  const observer=new ResizeObserver(draw);observer.observe(scene);observer.observe(viewport);draw();
  return ()=>{observer.disconnect();root.removeEventListener('click',click);viewport.removeEventListener('pointerdown',down);viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',up);viewport.removeEventListener('pointercancel',up);viewport.removeEventListener('wheel',wheel);};
}
