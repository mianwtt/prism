import {parseProductPage} from '../../src/public-product-page.mjs';
import {validateDecisionSchema,validateDecisionSettings,decisionScenarios} from '../../src/decision-schema.mjs';
import {checkDecisionCandidates} from '../../src/general-research.mjs';
import {structuredProductCandidate} from '../../src/public-product-page.mjs';

// Explicit software fixtures; these merchants, models and prices are not listings.
export function productPage({site='shop-a.example.com',price=6100,memory='16GB',seller='测试商家甲',conditions='',availability='InStock',shipping=0,model='FIXTURE-160512',observedAt=new Date().toISOString()}={}){
  const url='https://'+site+'/product/'+model.toLowerCase(),data={'@context':'https://schema.org','@type':'Product',name:'软件测试电脑 '+model+' '+memory+' 512GB',brand:{name:'FixtureBrand'},mpn:model,additionalProperty:[{name:'内存',value:memory},{name:'存储',value:'512GB'},{name:'重量',value:'1.6kg'}],offers:{'@type':'Offer',price,priceCurrency:'CNY',seller:{name:seller},availability:'https://schema.org/'+availability,description:conditions,...(shipping!==null?{shippingDetails:{shippingRate:{value:shipping,currency:'CNY'}}}:{})}};
  data.additionalProperty.push({name:'处理器',value:'FixtureCPU-8000'});
  const html='<!doctype html><title>软件测试</title><script type="application/ld+json">'+JSON.stringify(data)+'</script><h1>'+data.name+'</h1>';
  return {...parseProductPage(html,url,{now:observedAt}),html};
}
export function sourceFromPage(page,id){return {id,url:page.url,title:page.title,text:page.text,kind:'page',retrievedAt:page.observedAt,productObservation:page.productObservation,pageIdentity:{name:page.productObservation.name}};}
export function commerceFixture(){
  const schema=validateDecisionSchema({id:'commerce-test',label:'软件测试同款比价',optionLabel:'商品',fields:[{key:'price',label:'价格',unit:'元',direction:-1},{key:'memory',label:'内存',unit:'GB',direction:1},{key:'weight',label:'重量',unit:'kg',direction:-1}]}),settings=validateDecisionSettings({limits:{price:7000,memory:16,weight:2}},schema);
  const pages=[productPage(),productPage({site:'shop-b.example.org',price:5900,seller:'测试商家乙'}),productPage({site:'discount.example.net',price:4900,seller:'测试优惠商家',conditions:'会员领券后专享'}),productPage({site:'soldout.example.edu',price:3900,seller:'测试缺货商家',availability:'OutOfStock'})];
  const sources=pages.map((p,i)=>sourceFromPage(p,'commerce-source-'+i)),raw=sources.map(s=>structuredProductCandidate(s,schema)),checked=checkDecisionCandidates(raw,sources,schema);
  const space={title:'同款多来源比价 · 软件测试',question:'比较同一款16GB内存电脑，预算7000元，重量不超过2kg。',mode:'live',schema,settings,baselineSettings:structuredClone(settings),candidates:checked.candidates,sources,trace:[],warnings:[],activeScenarioId:'scenario-baseline'};
  space.baselineCandidateIds=space.candidates.map(c=>c.id);space.scenarios=decisionScenarios(space);return {space,pages};
}
