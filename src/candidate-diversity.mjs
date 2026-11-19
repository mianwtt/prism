import {createHash} from 'node:crypto';
import {evaluateDecision} from './decision-schema.mjs';
import {suningMobileUrl} from './merchant-browser.mjs';

const clean=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').trim();
const appearance=/颜色|配色|外观|色系|colou?r|appearance/i;
const metadata=/商品编号|商品编码|货号|条形码|序列号|上市时间|保修|选购热点|产品定位|认证编号|制造商.*地址|生产商.*地址|sku|barcode|serial/i;
const uncertain=/^(?:其他|未知|不详|以实物为准|暂无|无|--?|\/|n\/?a)$/i;

// A conservative navigation/display group, never a claim of global entity identity.
// Require source-bound brand/model and at least three matching specification rows.
export function observedConfigurationKey(candidate,sources,schema,{question=''}={}){
  if(candidate.enabled===false||Object.values(candidate.facts).some(f=>['confirmed','assumption','example'].includes(f.status)))return null;
  const preference=question.replace(/(?:仅|只是|只有)?(?:颜色|配色)(?:不同|变化|差异)?(?:不算|不计|不作为)[^，。；,\n]*/g,'').replace(/(?:忽略|不考虑|无需考虑|不区分)(?:颜色|配色|外观)/g,'');
  if(appearance.test(preference)||/[\p{L}]{1,4}色/u.test(preference)||schema.fields.some(f=>appearance.test([f.label,...(f.aliases||[])].join(' '))))return null;
  const source=sources.find(s=>s.id===candidate.sourceId),o=source?.merchantObservation;
  if(!o||!suningMobileUrl(source.url)||suningMobileUrl(source.url)!==suningMobileUrl(o.url)||candidate.name!==o.name)return null;
  const attributes=new Map();
  for(const a of o.attributes||[]){
    const label=clean(a.label),value=clean(a.value);
    if(!label||!value||uncertain.test(value)||!String(source.text).normalize('NFKC').replace(/\s+/g,'').includes(String(a.quote||'').normalize('NFKC').replace(/\s+/g,''))||!a.quote)continue;
    if(attributes.has(label)&&attributes.get(label)!==value)return null;
    attributes.set(label,value);
  }
  const brand=attributes.get('品牌')||attributes.get('brand'),model=attributes.get('型号')||attributes.get('产品型号')||attributes.get('model');
  if(!brand||!model||model.length<3)return null;
  const specs=[...attributes].filter(([label])=>!appearance.test(label)&&!metadata.test(label)&&!['品牌','brand','型号','产品型号','model','系列'].includes(label)).sort(([a],[b])=>a.localeCompare(b));
  if(specs.length<3)return null;
  const facts=schema.fields.filter(f=>!(/^(?:元|cny|人民币)$/i.test(f.unit)&&/价格|售价|标价|报价|预算|费用|price|cost/i.test([f.label,...(f.aliases||[])].join(' '))))
    .map(f=>[f.key,candidate.facts[f.key]?.value??null]);
  return 'observed-config:'+createHash('sha256').update(JSON.stringify({brand,model,specs,facts})).digest('hex');
}

export function selectDiverseCandidates(candidates,sources,schema,settings,options={}){
  const ranks=new Map(evaluateDecision(candidates,settings,schema).map((r,i)=>[r.id,i]));
  const groups=new Map();
  for(const c of candidates){
    const key=observedConfigurationKey(c,sources,schema,options)||'candidate:'+c.id;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);
  }
  const selected=[],duplicates=[];
  for(const group of groups.values()){
    const ordered=[...group].sort((a,b)=>ranks.get(a.id)-ranks.get(b.id)),representative=ordered[0];selected.push(representative);
    for(const c of ordered.slice(1))duplicates.push({candidateId:c.id,name:c.name,sourceId:c.sourceId,representativeId:representative.id,reason:'已有相同已观察配置的选择；其他报价或配色的原始来源仍保留'});
  }
  return {candidates:selected,duplicates};
}
