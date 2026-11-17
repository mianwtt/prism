function capacities(text) {
  const values=[...String(text).matchAll(/(\d+(?:\.\d+)?)\s*(GB|TB|G)(?![a-z])/gi)].map(m=>Number(m[1])*(m[2].toUpperCase()==="TB"?1024:1));
  const storage=[...new Set(values.filter(v=>v>=256))],ram=[...new Set(values.filter(v=>v<=128))];
  return {storage:storage.length===1?storage[0]:null,memory:ram.length===1&&(values.length>1||/内存|RAM|memory/i.test(text))?ram[0]:null};
}
export function configurationIssue(name,title) {
  const dellModel=s=>/灵越(?:PLUS)?\s*(?:\d{2}\s*[-/])?(\d{4})(?!\d)/i.exec(String(s))?.[1];
  if(dellModel(name)&&dellModel(title)&&dellModel(name)!==dellModel(title))return `灵越具体型号 ${dellModel(name)} 与 ${dellModel(title)} 不同，不能混用`;
  const expected=capacities(name),found=capacities(title||"");
  if(expected.storage&&found.storage&&expected.storage!==found.storage)return `来源标题是 ${found.storage}GB 存储配置，候选是 ${expected.storage}GB，不能混用`;
  if(expected.memory&&found.memory&&expected.memory!==found.memory)return `来源标题是 ${found.memory}GB 内存配置，候选是 ${expected.memory}GB，不能混用`;
  const cpu=s=>[...new Set((String(s).match(/\b\d{3,5}(?:HX|HS|H|U|P)\b/gi)||[]).map(v=>v.toUpperCase()))];
  const expectedCpu=cpu(name),foundCpu=cpu(title);
  if(expectedCpu.length===1&&foundCpu.length===1&&expectedCpu[0]!==foundCpu[0])return `处理器 ${foundCpu[0]} 与 ${expectedCpu[0]} 不同，不能混用`;
  const sku=s=>String(s).match(/\b(?:\d{2}-)?((?:bu|hu|mh)\d{4}(?:TU|AU))\b/i)?.[1]?.toUpperCase();
  if(sku(name)&&sku(title)&&sku(name)!==sku(title))return '厂家具体型号不同，不能混用';
  return null;
}
