import {validateDecisionSchema,validateDecisionSettings} from './decision-schema.mjs';

// Bind an explicit requested place to observed platform geography. District
// names/codes are never a static domain template or an inference from adverts.
export function bindRentalScope(contract,page){
 const region=page?.requestedRegion,scope=contract.evidenceRequirements?.rentalScope;
 if(scope)return contract;
 if(!region){
  const city=page?.cityObservation?.name;
  // Even an over-specific model input such as 北京海淀 must first resolve
  // through the observed city index. A failed tool call cannot drop location.
  if(city&&contract.question.includes(city)&&!explicitRentalRegion(contract.question,city)){
   const next=structuredClone(contract);delete next.evidenceRequirements.unresolvedRentalRegion;return next;
  }
  return contract;
 }
 const value=region.city+' · '+region.district;
 const options=[...new Set([value,...(page.districts||[]).map(district=>region.city+' · '+district)])].slice(0,12);
 if(options.length<2)throw new Error('公开目录尚不足以核对所选区域，不能把全市房源视为区域匹配');
 const next=structuredClone(contract);
 let field=next.schema.fields.find(f=>f.type==='enum'&&/区域|地区|行政区|district|location/i.test([f.label,...(f.aliases||[])].join(' ')));
 if(field){
  // Keep the Agent's semantic key, but ground its categories in the actual
  // city/district labels instead of invented or ambiguously unqualified names.
  field.options=options;field.preferred=null;
 }else{
  let key='listingRegion';while(next.schema.fields.some(f=>f.key===key))key+='X';
  field={key,label:'房源区域',type:'enum',options,direction:1,aliases:['区域','地区','行政区','所在区域'],reason:'用户明确指定区域；按同一房源详情中的城市和行政区核对'};
  next.schema.fields.push(field);
 }
 next.schema=validateDecisionSchema(next.schema);
 const bind=settings=>validateDecisionSettings({...settings,limits:{...settings.limits,[field.key]:value},weights:{...settings.weights,[field.key]:0}},next.schema);
 next.settings=bind(next.settings);
 next.whatifs=(next.whatifs||[]).map(branch=>({...branch,settings:bind(branch.settings)}));
 next.evidenceRequirements={...next.evidenceRequirements,rentalScope:{field:field.key,city:region.city,catalogUrl:page.cityObservation?.url}};
 delete next.evidenceRequirements.unresolvedRentalRegion;
 return next;
}

// This is a request span, not a claimed fact or a guessed platform district.
// Until a reader resolves it against actual geography, fail closed rather than
// silently treating a district request as a city-wide task after network errors.
export function explicitRentalRegion(question,city){
 const request=String(question||'').replace(/\s/g,'');
 if(!city||!request.includes(city)||/(?:区域|地区|行政区)(?:不限制|不限|无要求)|不限(?:区域|地区|行政区)|不限制(?:区域|地区|行政区)/.test(request))return null;
 const name=String(city).replace(/市$/,''),escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const match=new RegExp('(?:^|在|到|只看)'+escaped+'市?([\\p{Script=Han}]{1,10}?)(?:租房|找房|整租)','u').exec(request);
 if(!match||/附近|周边|哪里|怎么|如何|便宜|合适|预算/.test(match[1]))return null;
 return {city:name,requested:match[1],quote:match[0]};
}

export function rentalScopedCatalogPrefix(sources,contract){
 const scope=contract.evidenceRequirements?.rentalScope;
 if(!scope||contract.settings.limits[scope.field]===null)return null;
 const source=sources.find(s=>s.retrieval?.requestedRegion&&s.retrieval?.navigationEvidence?.breadcrumb);
 return source?.retrieval.navigationEvidence.breadcrumb||null;
}
