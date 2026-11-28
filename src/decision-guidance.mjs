import {evaluateDecision,validateDecisionSettings} from './decision-schema.mjs';
import {evidenceRows} from './decision-workflow.mjs';

const fails=(field,value,limit)=>limit!==null&&(field.type==='boolean'||field.type==='enum'?value!==limit:field.direction===1?value<limit:value>limit);

// These are bounded calculations over this branch's evidence, not market-wide
// predictions or an estimate of the probability that a missing fact is true.
export function decisionGuidance(space,selected,{limit=3}={}) {
  const schema=space.schema,settings=validateDecisionSettings(selected.settings,schema);
  const ids=new Set(selected.candidateIds||space.candidates.map(c=>c.id));
  const pool=space.candidates.filter(c=>ids.has(c.id)&&c.enabled!==false);
  const rows=new Map(pool.map(c=>[c.id,evidenceRows(space,c)]));
  const relevant=field=>settings.limits[field.key]!==null||settings.weights[field.key]>0;
  const verified=row=>['cited','confirmed'].includes(row.status)||space.mode==='demo'&&row.status==='example';
  const usable=row=>verified(row)&&!(settings.evidenceMode==='reviewed'&&row.status!=='confirmed'&&row.status!=='example');
  const clean=pool.map(c=>({...c,facts:Object.fromEntries(rows.get(c.id).map(row=>[row.field.key,usable(row)?row.fact:{value:null,status:'unknown'}]))}));
  const ranked=evaluateDecision(clean,settings,schema),eligible=ranked.filter(r=>r.status==='eligible');
  const byId=new Map(ranked.map(row=>[row.id,row]));
  const total=Object.values(settings.weights).reduce((a,b)=>a+b,0);
  const investigations=[];
  for(const candidate of pool){
    const facts=rows.get(candidate.id),gaps=facts.filter(row=>relevant(row.field)&&!usable(row));
    if(!gaps.length)continue;
    const blocked=facts.some(row=>usable(row)&&fails(row.field,row.fact.value,settings.limits[row.field.key]));
    if(blocked)continue;
    const row=byId.get(candidate.id),hard=gaps.filter(g=>settings.limits[g.field.key]!==null);
    const upperBound=row.score+gaps.reduce((sum,g)=>sum+settings.weights[g.field.key]/total*100,0);
    const couldAffectRanking=!eligible.length||upperBound>=eligible[0].score-1e-8;
    if(!hard.length&&!couldAffectRanking)continue;
    const reviewOnly=gaps.every(g=>verified(g))&&settings.evidenceMode==='reviewed';
    investigations.push({id:'check-'+candidate.id,candidateId:candidate.id,candidateName:candidate.name,
      fieldKeys:gaps.map(g=>g.field.key),fields:gaps.map(g=>({key:g.field.key,label:g.field.label,status:g.status,hard:settings.limits[g.field.key]!==null})),
      kind:reviewOnly?'review':'research',hardConditions:hard.length,couldAffectRanking,
      reason:hard.length?'缺少硬条件的可用依据，暂时不能确定是否符合要求。':eligible.length?'这项缺口可能影响当前排序，值得先核对。':'补齐这些依据后，才能完成当前条件下的比较。',
      _score:row.score});
  }
  investigations.sort((a,b)=>Number(b.hardConditions>0)-Number(a.hardConditions>0)||Number(b.couldAffectRanking)-Number(a.couldAffectRanking)||a.fieldKeys.length-b.fieldKeys.length||b._score-a._score||a.id.localeCompare(b.id));

  const suggestions=new Map();
  function propose(kind,changes,targetId){
    if(!changes.length||changes.length>2)return;
    const next=structuredClone(settings);
    for(const change of changes)next.limits[change.field]=change.value;
    const after=evaluateDecision(clean,next,schema).filter(row=>row.status==='eligible');
    const entered=after.filter(row=>!eligible.some(old=>old.id===row.id));
    const exited=eligible.filter(row=>!after.some(now=>now.id===row.id));
    if(kind==='relax'?!entered.length:!after.length||!exited.length)return;
    const id=kind+':'+changes.map(c=>c.field+'='+encodeURIComponent(JSON.stringify(c.value))).sort().join('|');
    const cost=changes.reduce((sum,change)=>{
      const field=schema.fields.find(f=>f.key===change.field);
      if((field.type||'number')!=='number')return sum+1;
      const values=clean.map(c=>c.facts[field.key]?.value).filter(Number.isFinite);
      const span=Math.max(...values)-Math.min(...values);
      return sum+Math.abs(change.value-settings.limits[field.key])/(span||Math.max(Math.abs(settings.limits[field.key]||0),1));
    },0);
    if(!suggestions.has(id))suggestions.set(id,{id,kind,changes,targetCandidateId:targetId,
      beforeCount:eligible.length,afterCount:after.length,entered:entered.map(r=>({id:r.id,name:r.name})),exited:exited.map(r=>({id:r.id,name:r.name})),settings:next,_cost:cost});
  }
  for(const candidate of clean){
    if(byId.get(candidate.id).status!=='excluded')continue;
    const facts=rows.get(candidate.id);
    if(facts.some(row=>relevant(row.field)&&!usable(row)))continue;
    const changes=facts.filter(row=>fails(row.field,row.fact.value,settings.limits[row.field.key])).map(row=>({field:row.field.key,label:row.field.conditionLabel||row.field.label,from:settings.limits[row.field.key],value:row.fact.value,quote:row.fact.quote,sourceId:row.fact.sourceId,candidateName:candidate.name}));
    propose('relax',changes,candidate.id);
  }
  if(eligible.length>1)for(const field of schema.fields){
    const limit=settings.limits[field.key];
    if((field.type||'number')!=='number'||limit===null)continue;
    const options=eligible.map(row=>clean.find(c=>c.id===row.id)).filter(c=>Number.isFinite(c.facts[field.key]?.value)&&fails(field,limit,c.facts[field.key].value));
    options.sort((a,b)=>Math.abs(a.facts[field.key].value-limit)-Math.abs(b.facts[field.key].value-limit));
    for(const candidate of options){
      const fact=candidate.facts[field.key];
      const before=suggestions.size;
      propose('focus',[{field:field.key,label:field.conditionLabel||field.label,from:limit,value:fact.value,quote:fact.quote,sourceId:fact.sourceId,candidateName:candidate.name}],candidate.id);
      if(suggestions.size>before)break;
    }
  }
  const proposals=[...suggestions.values()].sort((a,b)=>(eligible.length?0:Number(b.kind==='relax')-Number(a.kind==='relax'))||a.changes.length-b.changes.length||a._cost-b._cost||b.entered.length-a.entered.length||a.id.localeCompare(b.id));
  // Keep both exploration directions when possible rather than filling the UI
  // with several almost identical relaxations of one threshold.
  const diverse=[];
  for(const kind of ['relax','focus']){const first=proposals.find(p=>p.kind===kind);if(first)diverse.push(first);}
  for(const proposal of proposals)if(!diverse.includes(proposal))diverse.push(proposal);
  return {candidateCount:pool.length,eligibleCount:eligible.length,
    investigations:investigations.slice(0,limit).map(({_score,...task})=>task),
    suggestions:diverse.slice(0,limit).map(({_cost,...proposal})=>proposal),
    scope:'current-branch',demo:space.mode==='demo'};
}
