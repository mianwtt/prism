// Shared, data-only evidence checks. A quote match establishes provenance, not truth.
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const quantities={kg:['mass',1000],千克:['mass',1000],公斤:['mass',1000],g:['mass',1],克:['mass',1],分钟:['time',1],min:['time',1],小时:['time',60],h:['time',60],gb:['capacity',1],tb:['capacity',1024],元:['money',1],cny:['money',1],万元:['money',10000],万:['money',10000],'㎡':['area',1],m2:['area',1],'m²':['area',1],平米:['area',1],平方米:['area',1]};
export function convertQuantity(value,from,to){
  const a=quantities[String(from).toLowerCase()],b=quantities[String(to).toLowerCase()];
  return a&&b&&a[0]===b[0]?value*a[1]/b[1]:null;
}
export function constraintNumberSupported(value,quote,unit){
  const relevant=[...String(quote).matchAll(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g\b|克|分钟|min\b|小时|h\b|GB\b|TB\b|万元|万|元|CNY\b|㎡|m²|m2\b|平方米|平米)/gi)].map(m=>convertQuantity(Number(m[1]),m[2],unit)).filter(n=>n!==null);
  if(relevant.length)return relevant.some(n=>Math.abs(n-value)<1e-9);
  return (String(quote).match(/\d+(?:,\d{3})*(?:\.\d+)?/g)||[]).some(n=>Number(n.replaceAll(',',''))===value);
}
export function observationConversion(field,observation){
  for(const match of String(observation?.quote||'').replace(/(?<=\d),(?=\d{3})/g,'').matchAll(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g\b|克|分钟|min\b|小时|h\b|GB\b|TB\b|万元|万|元|CNY\b)/gi)){
    const converted=convertQuantity(Number(match[1]),match[2],field.unit);
    if(converted!==null&&Math.abs(converted-observation.value)<1e-9&&Number(match[1])!==observation.value)return {fromValue:Number(match[1]),fromUnit:match[2],toValue:observation.value,toUnit:field.unit};
  }
  return null;
}
export function sourceSite(raw) {
  try { const parts=new URL(raw).hostname.toLowerCase().split('.');return parts.slice(/\.(?:com|net|org|co|ac)\.(?:cn|uk|jp|au|nz)$/.test(parts.join('.'))?-3:-2).join('.'); } catch { return ''; }
}
export function observationIssue(field, observation, source) {
  const quote = normalize(observation?.quote), value = observation?.value;
  if (!source || source.refreshStatus === 'failed' || quote.length < 3 || !normalize(source.text).includes(quote)) return '引文未在保存的来源中找到';
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') return '该条件需要明确的是或否';
    const terms = [field.label, ...(field.aliases || []), field.label.replace(/^(?:是否|允许|支持|提供|具备|包含|可否|可以)/, '')].filter(Boolean);
    const term = terms.find(term => quote.includes(term));
    if (!term) return '引文没有明确提到这个条件';
    const at = quote.indexOf(term), context = quote.slice(Math.max(0, at - 8), at + term.length + 8);
    const negative = /不允许|不支持|禁止|不可|不能|不接受|不提供|不具备|不含|没有|未配备|不安静|不充足|不允许|(?:^|[，,:：\s])(?:无|否)(?:[，,。\s]|$)/.test(context);
    return negative === value ? '引文的肯定或否定与提取值不一致' : null;
  }
  if (field.type === 'enum') return field.options?.includes(value) && quote.includes(value) ? null : '引文未明确支持这个分类值';
  if (!Number.isFinite(value) || value < 0) return '数值格式无效';
  const numeric = quote.replace(/(?<=\d),(?=\d{3})/g, '');
  const number = escape(String(value)) + (Number.isInteger(value) ? '(?:\\.0+)?' : '');
  const token = `(?<![\\d.])${number}(?![\\d.])`;
  const unit = normalize(field.unit || '');
  let pattern;
  if (unit === '元/月') pattern = `(?:${token}\\s*(?:元\\s*[/／]\\s*月|元每月)|[¥￥]\\s*${token}\\s*[/／]\\s*月|月租\\s*[:：]?\\s*[¥￥]?\\s*${token}\\s*元?)`;
  else if (/^(?:元|CNY|人民币)$/i.test(unit)) pattern = `(?:${token}\\s*(?:元|CNY)|[¥￥]\\s*${token}|(?:CNY|人民币)\\s*${token})`;
  else {
    const units = /^(?:㎡|m2|m²|平米|平方米)$/.test(unit) ? '(?:㎡|m2|m²|平方米|平米)' : unit === '分钟' ? '(?:分钟|minutes?\\b|min\\b)' : unit.toLowerCase()==='kg'?'(?:kg|千克|公斤)':escape(unit);
    pattern = `${token}\\s*${units}(?![\\w.])`;
  }
  if (!new RegExp(pattern, 'i').test(numeric)&&!observationConversion(field,observation)) return '引文中的数值或单位不匹配';
  if (/内存|\bRAM\b/i.test(field.label) && /显存|VRAM|硬盘|SSD/i.test(quote) && !/内存|\bRAM\b/i.test(quote)) return '引文描述的是另一种容量，不能作为内存';
  if (/内存|\bRAM\b/i.test(field.label) && !/最大|扩展/.test(field.label) && /最大支持|可选|可扩展|最高支持/.test(quote)) return '可选或最大扩展容量不能作为已安装内存';
  if (/重量|净重|机身重/.test(field.label) && /包装|毛重|shipping\s*weight/i.test(quote) && !/净重|机身重/.test(quote)) return '包装重量不能作为机身重量';
  if (/元|CNY|人民币/.test(unit)) {
    if (unit==='元/月' && /[/／]\s*(?:年|天|日)|每年|每天/.test(quote)) return '报价周期与月租单位不一致';
    if (/\d\s*[-~–至到]\s*\d/.test(quote)) return '区间报价不能作为单一配置的标价';
    if (/起售|起价|起步价|参考价|参考报价|最低价|价格区间|券后|补贴后|国补后|会员价|以旧换新|领券|(?:元|[\d])\s*起(?:[，,。\s]|$)/.test(quote)) return '起价、参考价或有条件的价格，不能作为公开标价';
    if (/发布会|上市新闻|首发报道|新闻/.test(source.title || '')) return '新闻中的价格不能作为当前公开标价';
  }
  return null;
}

export function entityQuoteIssue(name, quote, source, otherNames=[]) {
  const entity = normalize(name), title = normalize(source?.title), text = normalize(source?.text), excerpt = normalize(quote);
  const at=text.indexOf(entity),pos=text.indexOf(excerpt,at);
  if(otherNames.filter(other=>normalize(other)!==entity).some(other=>{const next=text.indexOf(normalize(other),at+entity.length);return next>=0&&next<pos;}))return '引文位于另一个方案的段落，未计入当前方案';
  const compact=s=>s.replace(/\s/g,'');
  if (compact(title).includes(compact(entity)) || compact(excerpt).includes(compact(entity)) || source.pageIdentity?.name&&compact(normalize(source.pageIdentity.name))===compact(entity)) return null;
  // List/search pages need the quote in the same short entity section, not a neighbouring result.
  const lines = String(source?.text || '').split(/\n(?=\s*(?:#{1,6}\s|[-*]\s*\[))/);
  if (lines.some(section => normalize(section).includes(entity) && normalize(section).includes(excerpt) && normalize(section).length <= 1600)) return null;
  if(/\n\s*#{1,6}\s/.test(String(source?.text||'')))return '引文未出现在这个方案的详情段落';
  return at >= 0 && pos >= at && pos - at < 500 && !/\n\s*\n/.test(String(source?.text || '').slice(at, pos)) ? null : '引文不能明确归属于这个具体方案';
}
