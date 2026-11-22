// Acceptance requirements are supplied by a frozen task, not inferred from the Agent schema.
// This checks recorded support and task coverage, not independent publisher truth.
import {evaluateDecision} from '../../src/decision-schema.mjs';
import {observedConfigurationKey} from '../../src/candidate-diversity.mjs';
const normalize=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const names={price:/价格|售价|标价|报价|预算|费用|price|cost/i,memory:/内存|\bram\b/i,weight:/重量|净重|机身重|weight/i,
 storage:/硬盘|固态|存储|机身内存|\brom\b|\bssd\b|storage/i,rent:/租金|月租|租价|租赁|预算|rent/i,area:/面积|area/i};
function matchesRule(field,kind){
  const label=field.label||'';
  if(kind==='memory'&&/显存|vram|存储|硬盘|固态|\brom\b|机身内存/i.test(label)&&!/运行内存|\bram\b/i.test(label))return false;
  if(kind==='storage'&&/运行内存|\bram\b|显存|vram/i.test(label))return false;
  if(kind==='storage'&&/内存/.test(label)&&!/机身内存|存储|硬盘/.test(label))return false;
  return Boolean(names[kind]?.test([label,...(field.aliases||[])].join(' ')));
}
const units={元:['money',1],cny:['money',1],人民币:['money',1],万元:['money',10000],gb:['capacity',1],tb:['capacity',1024],
 kg:['mass',1],千克:['mass',1],公斤:['mass',1],g:['mass',.001],克:['mass',.001],'㎡':['area',1],m2:['area',1],平米:['area',1],平方米:['area',1],sqm:['area',1],'sq.m':['area',1],'sq.m.':['area',1],'m^2':['area',1],squaremeter:['area',1],squaremeters:['area',1],squaremetre:['area',1],squaremetres:['area',1]};
function convert(value,from,to){
  from=normalize(from).replace(/\s/g,'').toLowerCase();to=normalize(to).replace(/\s/g,'').toLowerCase();
  if(from===to)return value;
  const a=units[from],b=units[to];return a&&b&&a[0]===b[0]?value*a[1]/b[1]:null;
}
function publicURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u:null;}catch{return null;}}
function identityURL(value){
  const u=publicURL(value);if(!u)return null;
  if(/(^|\.)suning\.com$/.test(u.hostname)){
    const m=/\/(\d+)\/(\d+)\.html$/.exec(u.pathname);if(m)return 'suning:'+m[1]+':'+m[2].replace(/^0+(?=\d)/,'');
  }
  if(/(^|\.)fang\.com$/.test(u.hostname)){
    const m=/\/(?:chuzu\/)?[13]_(\d+)(?:_\d\.htm|\.html)$/.exec(u.pathname);if(m)return 'fang:'+m[1];
  }
  u.hash='';for(const key of [...u.searchParams.keys()])if(/^(?:utm_|spm$|from$)/i.test(key))u.searchParams.delete(key);
  return u.href;
}
function citation(candidate,fact,sources){
  if(!fact||!['cited','confirmed'].includes(fact.status)||!Number.isFinite(fact.value))return false;
  const source=sources.find(s=>s.id===fact.sourceId),quote=normalize(fact.quote),own=sources.find(s=>s.id===candidate.sourceId);
  if(!source||!own||!publicURL(source.url)||quote.length<3||!normalize(source.text).includes(quote))return false;
  return source.id===own.id||identityURL(source.url)===identityURL(own.url)||Boolean(candidate.identity&&normalize(source.text).includes(normalize(candidate.identity.value)));
}
export function assessResearchTask(task,space,{minimum=3}={}){
  if(!space||!Array.isArray(space.candidates)||!Array.isArray(space.schema?.fields)||!Array.isArray(space.sources))return {qualified:0,passed:false,reason:'missing-result',rows:[],requiredFields:task.criteria.length};
  let eligible=new Set();try{eligible=new Set(evaluateDecision(space.candidates,space.settings||{},space.schema).filter(r=>r.status==='eligible').map(r=>r.id));}catch{}
  const rows=[],seen=new Set(),configurations=new Set();
  for(const c of space.candidates){
    const source=space.sources.find(s=>s.id===c.sourceId),fields=[];
    for(const rule of task.criteria){
      let observation=null;
      for(const field of space.schema.fields){
        const label=[field.label,...(field.aliases||[])].join(' '),fact=c.facts?.[field.key];
        if((field.type||'number')!=='number'||!matchesRule(field,rule.kind)||!citation(c,fact,space.sources))continue;
        if(rule.kind==='memory'&&/显存|vram/i.test(field.label)&&!/内存|\bram\b/i.test(field.label))continue;
        let value=convert(fact.value,field.unit,rule.unit);
        if(rule.kind==='rent'&&normalize(rule.unit)==='元/月'){
          const unit=normalize(field.unit).replace(/\s/g,'');
          const monthly=/元\s*[/／]\s*月|每月|月租/.test(normalize(fact.quote));
          if(monthly&&(unit==='元/月'||/^(?:元|CNY|人民币)$/i.test(unit)))value=fact.value;
        }
        if(value===null)continue;
        if(rule.kind==='storage'&&/可选|可扩展|最大支持|最高支持/.test(fact.quote))continue;
        observation={field:field.key,value,unit:rule.unit,supported:true,
          meets:(rule.minimum===undefined||value>=rule.minimum)&&(rule.maximum===undefined||value<=rule.maximum)};
        break;
      }
      fields.push(observation||{kind:rule.kind,supported:false,meets:false});
    }
    const mediaSource=space.sources.find(s=>s.id===c.media?.sourceId),mediaPage=c.media?.sourceUrl||c.media?.pageUrl;
    const sourceImage=Boolean(publicURL(c.media?.url)&&mediaSource&&identityURL(mediaPage)===identityURL(mediaSource.url)&&
      (mediaSource.id===c.sourceId||identityURL(mediaSource.url)===identityURL(source?.url)));
    const observedType=source?.rentalObservation?.rentalType;
    const sourceURL=publicURL(source?.url),code=sourceURL?.hostname.match(/^([a-z]+)\.zu\.fang\.com$/)?.[1]||sourceURL?.pathname.match(/^\/(?:zf\/)?([a-z]+)\//)?.[1];
    const city=!task.cityCodes||task.cityCodes.includes(code),rentalType=!task.rentalType||observedType===task.rentalType;
    // A city-level source URL or a neighbourhood name in an advert cannot pass
    // a district-specific task. Inspect the native main-listing observation,
    // independently of whether the Agent remembered to create a region field.
    const location=source?.rentalObservation?.location;
    const geography=!task.geography||Boolean(location&&location.city===task.geography.city&&location.district===task.geography.district&&
      location.provenance?.listingId===sourceURL?.pathname.match(/\/(?:chuzu\/)?[13]_(\d+)(?:_\d\.htm|\.html)$/)?.[1]&&
      normalize(source.text).includes(normalize(location.quote))&&normalize(location.quote).includes(normalize(location.value)));
    const key=identityURL(source?.url),duplicate=key&&seen.has(key);if(key)seen.add(key);
    const applicationEligible=eligible.has(c.id);
    const configurationKey=observedConfigurationKey(c,space.sources,space.schema,{question:task.question||''}),configurationDuplicate=Boolean(configurationKey&&configurations.has(configurationKey));
    const qualified=fields.every(f=>f.supported&&f.meets)&&applicationEligible&&city&&geography&&rentalType&&(!task.sourceImages||sourceImage)&&!duplicate&&!configurationDuplicate&&(!task.distinctConfigurations||Boolean(configurationKey));
    if(qualified&&configurationKey)configurations.add(configurationKey);
    rows.push({id:c.id,qualified,applicationEligible,fields,city,geography,rentalType,sourceImage,duplicate:Boolean(duplicate),configurationDuplicate,configurationSupported:Boolean(configurationKey),imageURL:sourceImage?c.media.url:null});
  }
  const qualified=rows.filter(row=>row.qualified).length;
  return {qualified,passed:qualified>=minimum,candidates:rows.length,requiredFields:task.criteria.length,
    supportedFields:rows.reduce((n,row)=>n+row.fields.filter(f=>f.supported).length,0),totalRequestedFields:rows.length*task.criteria.length,
    schemaCoverage:task.criteria.filter(rule=>space.schema.fields.some(f=>matchesRule(f,rule.kind))).length,
    rows,meaning:'Recorded-source support and task coverage. Field truth and exact configuration still need original-page review.'};
}
