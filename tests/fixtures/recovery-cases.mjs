// Fictional controlled providers. No URL is requested over a network.
export const recoveryCases=[
  {id:'generic-catalog-links',domain:'computer',mode:'catalog',initial:1},
  {id:'observed-details-rewrite-error',domain:'rental',mode:'catalog',initial:1,failRewrite:true},
  {id:'transient-selection',domain:'rental',mode:'catalog',initial:1,failSelection:true},
  {id:'unobserved-selection',domain:'rental',mode:'catalog',initial:1,invalidSelection:true},
  {id:'search-detail-batches',domain:'computer',mode:'queries'},
  {id:'failed-extraction-batch',domain:'rental',mode:'queries',failExtraction:true},
  {id:'duplicate-recovery-queries',domain:'computer',mode:'queries',duplicateQueries:true},
  {id:'already-comparable',domain:'rental',mode:'catalog',initial:3,control:'sufficient'},
  {id:'unsupported-facts',domain:'computer',mode:'queries',invalidFacts:true,control:'reject'},
  {id:'unreadable-details',domain:'rental',mode:'catalog',initial:0,unreadable:true,control:'reject'},
];

export function recoveryFixture(spec){
  const rental=spec.domain==='rental';
  const fields=rental?[{key:'rent',label:'月租',unit:'元/月',direction:-1},{key:'area',label:'面积',unit:'㎡',direction:1}]
    :[{key:'price',label:'价格',unit:'元',direction:-1,aliases:['预算']},{key:'memory',label:'内存',unit:'GB',direction:1}];
  const question=rental?'找租房方案，月租不超过4000元/月，面积至少30㎡':'比较电脑方案，预算6000元，内存至少16GB';
  const constraints=rental?[{field:'rent',value:4000,quote:'月租不超过4000元/月'},{field:'area',value:30,quote:'面积至少30㎡'}]
    :[{field:'price',value:6000,quote:'预算6000元'},{field:'memory',value:16,quote:'内存至少16GB'}];
  const catalogUrl=rental?'https://zu.fang.com/hz/':'https://catalog.example.org/catalog';
  const records=Array.from({length:8},(_,index)=>{
    const name=(rental?'虚构测试住处':'虚构测试电脑')+index;
    const url=rental?`https://zu.fang.com/hz/chuzu/3_${123456780+index}_1.htm`:`https://catalog.example.org/detail/${index}`;
    const values=rental?[3200+index*50,40+index]:[3500+index*100,16+index*8];
    const quotes=fields.map((field,i)=>field.label+values[i]+field.unit);
    return {name,url,values,quotes,text:[name,...quotes].join('\n')};
  });
  const links=records.slice(0,6).map(record=>({url:record.url,title:record.name,summary:record.name}));
  const catalog={url:catalogUrl,title:'虚构测试目录',text:'虚构测试目录\n'+links.map(link=>link.url).join('\n'),...(rental?{observedLinks:links}:{})};
  const counters={model:0,search:0,read:0,invalidReads:0,selection:0,extract:0},reads=[];
  let recovering=false,failedExtraction=false;
  const io={
    async search(query){
      counters.search++;
      if(query==='初始公开目录')return spec.mode==='catalog'?[{url:catalog.url,title:catalog.title,raw_content:catalog.text}]:[];
      const start=query==='补查第二组'?4:0;
      return records.slice(start,start+4).map(record=>({url:record.url,title:record.name,raw_content:record.text}));
    },
    async fetchSource(url){
      counters.read++;reads.push(url);
      if(url===catalog.url)return catalog;
      const record=records.find(row=>row.url===url);
      if(!record){counters.invalidReads++;throw new Error('Unobserved URL was requested');}
      if(spec.unreadable)throw new Error('Controlled unreadable detail');
      return record.text;
    },
    async model(messages){
      counters.model++;
      const prompt=messages[0].content,input=JSON.parse(messages[1].content);
      if(prompt.startsWith('Analyze this individual'))return {schema:{label:'受控恢复测试',fields},constraints,queries:['初始公开目录'],whatifs:[{name:'如果放宽费用',changes:[{field:fields[0].key,value:rental?4500:6500}]}]};
      if(prompt.startsWith('All previous searches'))return {queries:[]};
      if(prompt.startsWith('Select up to 6'))return {urls:records.slice(0,spec.initial||0).map(record=>record.url)};
      if(prompt.startsWith('There are fewer')||prompt.startsWith('Choose up to 4')){
        recovering=true;counters.selection++;
        if(spec.failSelection&&counters.selection===1)throw new Error('Controlled model error');
        if(spec.invalidSelection&&counters.selection===1)return {urls:['https://unobserved.example.org/invented']};
        return {urls:input.links.map(link=>link.url)};
      }
      if(prompt.startsWith('The first sources')){
        recovering=true;
        if(spec.failRewrite)throw new Error('Controlled query rewrite failure');
        return {queries:spec.mode==='catalog'?[]:spec.duplicateQueries?['补查第一组',' 补查第一组 ']:['补查第一组','补查第二组']};
      }
      if(prompt.startsWith('Return compact JSON {candidates:')){
        counters.extract++;
        if(spec.failExtraction&&recovering&&!failedExtraction){failedExtraction=true;throw new Error('Controlled extraction error');}
        return {candidates:input.sources.flatMap(source=>{
          const record=records.find(row=>row.url===source.url);if(!record)return [];
          return [{name:record.name,sourceId:source.id,facts:Object.fromEntries(fields.map((field,i)=>[field.key,
            {value:spec.invalidFacts?999:record.values[i],quote:record.quotes[i],sourceId:source.id}]))}];
        })};
      }
      if(prompt.startsWith('Analyze ONLY'))return {summary:'受控数据的比较结果',insights:[]};
      throw new Error('Unexpected model action in controlled fixture');
    },
  };
  return {io,question,counters,reads,records,fields};
}
