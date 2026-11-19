import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessResearchTask} from '../scripts/lib/research-acceptance.mjs';
const suite=JSON.parse(await readFile(new URL('./fixtures/research-acceptance-tasks.json',import.meta.url),'utf8'));
const extended=JSON.parse(await readFile(new URL('./fixtures/research-acceptance-extended.json',import.meta.url),'utf8'));
function fixture(){
 const sources=Array.from({length:3},(_,i)=>({id:'s'+i,url:'https://example.org/product/'+i,text:'商品'+i+' 价格5000元 内存32GB 重量1.5kg 固态硬盘1TB'}));
 return {schema:{fields:[{key:'cost',label:'价格',unit:'元'},{key:'ram',label:'内存',unit:'GB'},{key:'mass',label:'重量',unit:'kg'},{key:'disk',label:'固态硬盘',unit:'TB'}]},sources,
  candidates:sources.map((s,i)=>({id:'c'+i,name:'商品'+i,sourceId:s.id,media:{url:'https://example.org/image/'+i+'.jpg',sourceId:s.id,pageUrl:s.url},facts:Object.fromEntries([['cost',5000,'价格5000元'],['ram',32,'内存32GB'],['mass',1.5,'重量1.5kg'],['disk',1,'固态硬盘1TB']].map(([key,value,quote])=>[key,{value,quote,sourceId:s.id,status:'cited'}]))}))};
}
test('the frozen suite contains five computer and five rental tasks with explicit independent requirements',()=>{
 assert.equal(suite.tasks.length,10);assert.equal(new Set(suite.tasks.map(t=>t.id)).size,10);
 for(const domain of ['computer','rental'])assert.equal(suite.tasks.filter(t=>t.domain===domain).length,5);
 assert(suite.tasks.every(t=>t.criteria.length>=2&&t.sourceImages));
});

test('new scene tasks keep their own criteria; phone storage aliases must never masquerade as RAM',()=>{
 assert.equal(extended.tasks.length,5);assert.equal(extended.tasks.filter(t=>t.distinctConfigurations).length,3);
 const s=fixture();s.schema.fields=s.schema.fields.filter(f=>f.key!=='ram');
 s.schema.fields.find(f=>f.key==='disk').label='存储容量';s.schema.fields.find(f=>f.key==='disk').aliases=['机身内存'];
 for(const c of s.candidates)delete c.facts.ram;
 const r=assessResearchTask(extended.tasks.find(t=>t.id==='E03'),s);assert.equal(r.qualified,0);assert.equal(r.schemaCoverage,2);assert(r.rows.every(row=>row.fields[1].supported===false));
});
test('omitting a requested dimension from the Agent schema cannot produce an acceptance pass',()=>{
 const s=fixture();s.schema.fields=s.schema.fields.filter(f=>f.key!=='mass');const r=assessResearchTask(suite.tasks[0],s);
 assert.equal(r.qualified,0);assert.equal(r.schemaCoverage,2);
});
test('conversion, limits and distinct supported source images are checked independently of Agent ranking',()=>{
 const s=fixture();assert.equal(assessResearchTask(suite.tasks[0],s).qualified,3);
 assert.equal(assessResearchTask(suite.tasks[4],s).qualified,3);
 s.candidates[0].facts.cost.value=7500;assert.equal(assessResearchTask(suite.tasks[0],s).qualified,2);
 s.candidates[1].media.pageUrl=s.sources[0].url;assert.equal(assessResearchTask(suite.tasks[0],s).qualified,1);
 s.candidates[2].facts.ram.status='example';assert.equal(assessResearchTask(suite.tasks[0],s).qualified,0);
});
test('a rental from another city or a shared room cannot pass a whole-rental request',()=>{
 const s=fixture();s.schema.fields=[{key:'rent',label:'月租金',unit:'元'},{key:'area',label:'面积',unit:'平方米'}];
 for(const [i,c]of s.candidates.entries()){
  const source=s.sources[i];source.url='https://m.fang.com/zf/hz/3_'+(123456780+i)+'.html';source.text='月租3200元/月 面积40㎡';source.rentalObservation={rentalType:'整租'};
  c.media.pageUrl=source.url;c.facts={rent:{value:3200,quote:'3200元/月',sourceId:source.id,status:'cited'},area:{value:40,quote:'40㎡',sourceId:source.id,status:'cited'}};
 }
 assert.equal(assessResearchTask(suite.tasks[5],s).qualified,3);
 s.sources[0].url=s.sources[0].url.replace('/hz/','/cd/');s.candidates[0].media.pageUrl=s.sources[0].url;
 s.sources[1].rentalObservation.rentalType='合租';assert.equal(assessResearchTask(suite.tasks[5],s).qualified,1);
});
test('supported task facts cannot pass when an extra unresolved Agent field prevents application comparison',()=>{
 const s=fixture();s.schema.fields.push({key:'photoFlag',label:'来源图片',type:'boolean',preferred:true});
 for(const c of s.candidates)c.facts.photoFlag={value:null,status:'unknown'};
 const result=assessResearchTask(suite.tasks[0],s);assert.equal(result.qualified,0);assert.ok(result.rows.every(r=>!r.applicationEligible&&r.sourceImage));
});
test('independent acceptance recognizes equivalent square-metre units but cannot treat square feet as square metres',()=>{
 const s=fixture();s.schema.fields=[{key:'rent',label:'月租金',unit:'元'},{key:'area',label:'面积',unit:'sqm'}];
 for(const [i,c]of s.candidates.entries()){
  const source=s.sources[i];source.url='https://m.fang.com/zf/hz/3_'+(123456780+i)+'.html';source.text='月租3200元/月 面积40㎡';source.rentalObservation={rentalType:'整租'};
  c.media.pageUrl=source.url;c.facts={rent:{value:3200,quote:'3200元/月',sourceId:source.id,status:'cited'},area:{value:40,quote:'40㎡',sourceId:source.id,status:'cited'}};
 }
 assert.equal(assessResearchTask(suite.tasks[5],s).qualified,3);s.schema.fields[1].unit='sqft';assert.equal(assessResearchTask(suite.tasks[5],s).qualified,0);
});
