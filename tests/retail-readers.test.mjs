import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductPage,pinnedLookup,structuredProductCandidate} from '../src/public-product-page.mjs';
import {retailProfile,parseRetailCatalog,catalogSearchUrl} from '../src/retail-page.mjs';
import {attachRetailCatalog} from '../src/retail-catalog.mjs';
import {observedResearchLinks,recoverResearch} from '../src/research-recovery.mjs';
import {offerComparison,productDescriptor} from '../src/product-offers.mjs';
import {checkDecisionCandidates} from '../src/general-research.mjs';
import {researchComparableOffers} from '../src/offer-research.mjs';
import {sourceFromPage} from './helpers/commerce-fixture.mjs';

// Small synthetic DOM fixtures use the public templates' selectors. These prices
// are software inputs; the separate live acceptance records actual observations.
const dfUrl='https://www.dfrobot.com.cn/goods-90001.html',waveUrl='https://www.waveshare.net/shop/test-board.htm';
const schema={fields:[{key:'price',label:'公开标价',unit:'CNY',direction:-1},{key:'ram',label:'内存容量',unit:'GB',direction:1},{key:'kit',label:'是否含配件套件',type:'boolean',preferred:false,aliases:['套装']} ]};
const dfHtml=({name='Raspberry Pi 树莓派5 开发板 - 8GB',price=1600,packing='Raspberry Pi 树莓派 5 开发板 - 8GB ×1',dataPrice=price}={})=>`<title>软件测试</title><h1>${name}</h1><section class="goodsMes" data-price="${dataPrice}" data-stock="有货"><div class="goodsDetial"><div class="clearfix"><span class="name">品牌</span><span class="content2">Raspberry Pi</span></div></div><div class="comPrice"><b id="ECS_SHOPPRICE">￥${price}.00</b></div></section><p>BCM2712 处理器</p><p>${packing}</p><img id="img_url" src="https://www.dfrobot.com.cn/test-board.jpg"><aside>推荐商品 ￥1.00，可选16GB</aside>`;
const waveHtml=({memory=8,price=1750,bundle='单独主机无套餐'}={})=>`<title>软件测试</title><h1>Raspberry Pi 5 ${memory}GB 树莓派5代 BCM2712处理器</h1><div class="goods-detail-line"><div class="line-left">品牌</div><div class="line-right">Raspberry Pi</div></div><div class="goods-detail-line"><div class="line-left">型号</div><div class="line-right">Raspberry Pi 5-${memory}GB</div></div><div class="goods-detail-line"><b class="sale-price">${price===null?'{{price}}':'¥'+price+'.00'}</b></div><div class="goods-detail-line"><div class="line-left">套餐选择</div><div class="current_goods">${bundle}</div><span>其他套餐：含显示器</span></div><img class="cloudzoom" src="https://www.waveshare.net/test-board.jpg"><aside>16GB 套餐 ¥999.00</aside>`;
const df=()=>sourceFromPage(parseProductPage(dfHtml(),dfUrl),'df');
const wave=options=>sourceFromPage(parseProductPage(waveHtml(options),waveUrl),'wave');

test('pinned DNS supports the Node all-address callback and retains the verified address',()=>{
  const address={address:'203.0.113.2',family:4},lookup=pinnedLookup(address);
  lookup('example.com',{all:true},(err,result)=>{assert.equal(err,null);assert.deepEqual(result,[address]);});
  lookup('example.com',{all:false},(err,ip,family)=>{assert.equal(err,null);assert.equal(ip,address.address);assert.equal(family,4);});
});
test('retailer profiles reject credentials, foreign hosts, ports and non-product routes',()=>{
  for(const url of ['https://www.dfrobot.com.cn@evil.com/goods-90001.html','https://www.dfrobot.com.cn:8080/goods-1.html','https://www.waveshare.net/account.htm'])assert.equal(retailProfile(url),null);
});
test('primary retailer price, selected RAM and original photo exclude related-product offers',()=>{
  const s=df();assert.equal(s.productObservation.offers[0].price,1600);assert.equal(productDescriptor(s).configuration.memory,'8gb');assert.equal(s.productObservation.image,'https://www.dfrobot.com.cn/test-board.jpg');
  const bad=parseProductPage(dfHtml({dataPrice:1}),dfUrl);assert.equal(bad.productObservation.offers.length,0);
});
test('unrendered dynamic prices remain absent instead of borrowing recommendation prices',()=>{
  assert.equal(wave({price:null}).productObservation.offers.length,0);
  assert.equal(wave().productObservation.offers[0].price,1750);
});
test('two retailer templates yield one checked board configuration, while RAM and kit variants remain distinct',()=>{
  const a=df(),b=wave(),candidate=checkDecisionCandidates([structuredProductCandidate(a,schema)],[a],schema).candidates[0];
  const comparison=offerComparison(candidate,[a,b,wave({memory:16}),wave({bundle:'含电源与外壳套餐'})],schema);
  assert.equal(comparison.sourceCount,2);assert.equal(comparison.offers.length,2);assert.equal(comparison.bestOfferId,'df-offer-0');
  assert.equal(candidate.facts.ram.value,8);assert.equal(candidate.facts.kit.value,false);assert.equal(candidate.facts.kit.status,'cited');
});
test('an incomplete packing list and an accessory title cannot supply board-only evidence',()=>{
  const page=parseProductPage(dfHtml({packing:'Raspberry Pi 树莓派 5 开发板 - 8GB ×1</p><p>电源 ×1'}),dfUrl),s=sourceFromPage(page,'kit');
  assert.notEqual(productDescriptor(s).configuration.bundle,'board-only');assert.equal(structuredProductCandidate(s,schema).facts.kit,undefined);
  assert.equal(parseProductPage(dfHtml({name:'Raspberry Pi 树莓派5 铝制外壳'}),dfUrl).productObservation.category,'electronic-component');
});
test('a catalogue search URL comes from the observed GET form and cannot change origin',()=>{
  const html='<form id="searchForm" method="get" action="search_elastic.php"><input name="keywords"></form>';
  assert.equal(new URL(catalogSearchUrl(html,'https://www.dfrobot.com.cn/category-1.html','Raspberry Pi 5')).pathname,'/search_elastic.php');
  assert.throws(()=>catalogSearchUrl(html.replace('search_elastic.php','https://evil.com/'),'https://www.dfrobot.com.cn/','x'));
});
test('catalogue discovery retains real product anchors and ignores cart, guessed and foreign links',()=>{
  const html=`<title>测试目录</title><a href="${dfUrl}">已观察到的开发板</a><a href="/flow.php">购物车</a><a href="https://evil.com/goods-1.html">外站</a>`;
  const page=parseRetailCatalog(html,'https://www.dfrobot.com.cn/search_elastic.php?keywords=board');
  // Parser can describe an external product link; attachment enforces shop origin.
  const source={url:page.url,text:page.text};attachRetailCatalog(source,{...page,observedLinks:[...page.observedLinks,{title:'伪造',url:'https://www.dfrobot.com.cn/goods-3.html'},{title:'坏链接',url:'invalid'}]});
  assert.deepEqual(source.observedLinks,[{url:dfUrl,title:'已观察到的开发板'}]);
});
test('multiple merchants share bounded discovery context before generic navigation links',()=>{
  const first=Array.from({length:40},(_,i)=>({title:'A'+i,url:'https://a.example.com/item/'+i}));
  const second=[{title:'B',url:'https://b.example.org/item/board'}];
  const links=observedResearchLinks([{observedLinks:first,text:''},{observedLinks:second,text:''}]);assert.equal(links[1].url,second[0].url);
});
test('shop-native catalogue discovery finds a checked second seller even when general search is unavailable',async()=>{
  const a=df(),b=wave(),candidate=checkDecisionCandidates([structuredProductCandidate(a,schema)],[a],schema).candidates[0],calls=[];
  const result=await researchComparableOffers({candidates:[candidate],sources:[a],schema},{publicCatalogs:[{platform:'waveshare',input:'keywords',capabilities:['electronics-components']}],search:async()=>{throw new Error('search unavailable');},searchCatalog:async request=>{calls.push(request);return {text:b.url,observedLinks:[{url:b.url,title:b.title}]};},fetchSource:async()=>({...b,observedAt:b.retrievedAt})});
  assert.equal(calls.length,1);assert.equal(result.coverage.matchedSources,2);assert.equal(result.sources[0].productObservation.offers[0].price,1750);
});
test('an explicit same-product task does not seek unrelated products merely to fill the three-candidate quota',async()=>{
  const source=df(),raw=structuredProductCandidate(source,schema);
  const result=await recoverResearch({question:'比较同款单板不同商家的报价',contract:{schema,settings:{limits:{}}},sources:[source],raw:[raw]}, {},{event:()=>{},assess:()=>({comparable:1})});
  assert.equal(result.recovery.target,1);assert.equal(result.recovery.stopReason,'not-needed');assert.equal(result.recovery.calls.read,0);
});
test('exact-product offer discovery keeps unrelated reads as sources without adding accessory or RAM variants as new candidates',async()=>{
  const a=df(),b=wave(),other=sourceFromPage(parseProductPage(waveHtml({memory:16}),'https://www.waveshare.net/shop/other-board.htm'),'other'),candidate=checkDecisionCandidates([structuredProductCandidate(a,schema)],[a],schema).candidates[0];
  const pages=[b,other],result=await researchComparableOffers({candidates:[candidate],sources:[a],schema},{search:async()=>pages.map(p=>({url:p.url,title:p.title,content:p.title})),fetchSource:async url=>{const p=pages.find(p=>p.url===url);return {...p,observedAt:p.retrievedAt};}},{exactOnly:true});
  assert.equal(result.sources.length,2);assert.equal(result.raw.length,1);assert.equal(result.raw[0].facts.ram.value,8);
});
