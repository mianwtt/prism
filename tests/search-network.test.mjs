import test from 'node:test';
import assert from 'node:assert/strict';
import {federatedSearch,searchSearxng} from '../src/search-network.mjs';
import {parseProductPage,publicAddress,assertPublicPage} from '../src/public-product-page.mjs';
import {readWithCrawl4ai} from '../src/crawl4ai-reader.mjs';
import {productPage} from './helpers/commerce-fixture.mjs';
import {browserProductUrl} from '../src/product-browser.mjs';

test('offer discovery fans out configured engines, deduplicates tracking URLs and preserves site diversity',async()=>{
  const calls=[],row=(host,n)=>({url:'https://'+host+'/product/'+n,title:host});
  const drivers={tofu:async()=>{calls.push('tofu');return [row('a.example.com',1),row('a.example.com',2),row('a.example.com',3)];},searxng:async()=>{calls.push('searxng');return [{...row('a.example.com',1),url:'https://a.example.com/product/1?utm_source=test'},row('b.example.org',1)];},tavily:async()=>{calls.push('tavily');throw new Error('offline');}};
  const result=await federatedSearch('完整型号 配置',drivers,{purpose:'offers',maxResults:8});assert.equal(calls.length,3);assert.equal(result.length,4);assert.match(result[1].url,/b\.example\.org/);assert.equal(result.filter(r=>/product\/1$/.test(r.url)).length,2);
});
test('an empty or failed primary search falls back, but complete service failure is surfaced',async()=>{
  const drivers={tofu:async()=>{throw new Error('offline');},searxng:async()=>[{url:'https://a.example.org/p',title:'实际服务返回'}]};
  assert.equal((await federatedSearch('查询',drivers))[0].retrieval.searchProvider,'searxng');await assert.rejects(federatedSearch('查询',{tofu:drivers.tofu}),/均未返回来源/);
});
test('SearXNG uses the documented JSON API, preserves reverse-proxy prefixes and fails on disabled JSON',async()=>{
  let requested;const results=await searchSearxng('电脑 型号',{SEARXNG_URL:'http://127.0.0.1:8080/searx',SEARXNG_ENGINES:'bing,brave'},{fetchFn:async url=>{requested=url;return Response.json({results:[{url:'https://a.example.org/item',title:'详情',content:'摘要',engine:'bing'}]});}});
  assert.equal(requested.pathname,'/searx/search');assert.equal(requested.searchParams.get('format'),'json');assert.equal(requested.searchParams.get('engines'),'bing,brave');assert.equal(results[0].retrieval.snippetOnly,true);
  await assert.rejects(searchSearxng('x',{SEARXNG_URL:'http://localhost:8080'},{fetchFn:async()=>new Response('Forbidden',{status:403})}),/403/);
});
test('the structured reader retains literal variant attributes, price basis, shipping and raw offer provenance',()=>{
  const p=productPage();assert.equal(p.productObservation.model,'FIXTURE-160512');assert.equal(p.productObservation.offers[0].price,6100);assert.equal(p.productObservation.offers[0].shipping,0);assert.match(p.productObservation.offers[0].raw,/priceCurrency/);assert.ok(p.text.includes(p.productObservation.offers[0].quote));
  const conditional=productPage({conditions:'会员领券后专享',shipping:null});assert.equal(conditional.productObservation.offers[0].basis,'conditional');assert.equal(conditional.productObservation.offers[0].shipping,null);
});
test('a multi-product page, product group and aggregate lowPrice never become an exact SKU quote',()=>{
  const one=productPage(),script=one.html.match(/<script[^>]*>(.*?)<\/script>/)[1],p=JSON.parse(script);
  assert.equal(parseProductPage('<script type="application/ld+json">'+JSON.stringify([p,p])+'</script>',one.url),null);
  p.offers={'@type':'AggregateOffer',lowPrice:100,highPrice:9999,priceCurrency:'CNY'};
  assert.equal(parseProductPage('<script type="application/ld+json">'+JSON.stringify(p)+'</script>',one.url).productObservation.offers.length,0);
});
test('the public reader rejects loopback, private IPv4/IPv6, credentials and DNS resolving to private networks',async()=>{
  for(const value of ['127.0.0.1','192.168.1.1','169.254.169.254','10.0.0.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(value),false,value);
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
  await assert.rejects(assertPublicPage('https://user:pass@example.org/product'));
  await assert.rejects(assertPublicPage('https://example.org/product',{lookupFn:async()=>[{address:'127.0.0.1',family:4}]}));
});
test('the fixed browser adapter accepts known public merchants while rejecting authentication and user-controlled lookalike origins',()=>{
  assert.ok(browserProductUrl('https://item.jd.com/100045189800.html'));
  for(const url of ['https://jd.com.attacker.example/product','https://passport.jd.com/new/login.aspx','https://user:pass@item.jd.com/1.html','http://item.jd.com/1.html','https://item.jd.com:9000/1.html'])assert.equal(browserProductUrl(url),null);
});
test('Crawl4AI optional adapter requests rendering without inline code and parses the returned original HTML',async()=>{
  const p=productPage();let request;
  const result=await readWithCrawl4ai(p.url,{CRAWL4AI_URL:'http://127.0.0.1:11235',CRAWL4AI_API_TOKEN:'fixture-token'},{validate:async url=>({url}),fetchFn:async(url,options)=>{request={url,...options};return Response.json({results:[{success:true,url:p.url,html:p.html}]});}});
  assert.equal(result.reader,'crawl4ai');assert.equal(result.productObservation.offers[0].price,6100);const body=JSON.parse(request.body);assert.deepEqual(body.urls,[p.url]);assert.equal(body.crawler_config.params.js_code,undefined);assert.equal(request.headers.Authorization,'Bearer fixture-token');
});
