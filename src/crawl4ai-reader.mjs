import {assertPublicPage,parseProductPage} from './public-product-page.mjs';
import {responseJson,serviceUrl} from './search-network.mjs';

// Optional existing Crawl4AI service. The app never sends model-written browser
// code/hooks, credentials, cookies or login instructions to the crawler.
export async function readWithCrawl4ai(raw,env,{fetchFn=fetch,validate=assertPublicPage}={}){
  const {url}=await validate(raw),base=serviceUrl(env.CRAWL4AI_URL),endpoint=new URL(base.href.replace(/\/$/,'')+'/crawl');
  const result=await responseJson(await fetchFn(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(env.CRAWL4AI_API_TOKEN?{Authorization:'Bearer '+env.CRAWL4AI_API_TOKEN}:{})},body:JSON.stringify({urls:[url],browser_config:{type:'BrowserConfig',params:{headless:true}},crawler_config:{type:'CrawlerRunConfig',params:{stream:false,cache_mode:'bypass',page_timeout:20000}}}),signal:AbortSignal.timeout(45000)}),5_000_000);
  const page=result.results?.[0];if(!page?.success)throw new Error('Crawl4AI 未取得公开页面');
  const finalUrl=page.url||url;await validate(finalUrl);
  const structured=page.html&&parseProductPage(String(page.html).slice(0,5_000_000),finalUrl);if(structured)return {...structured,reader:'crawl4ai'};
  const text=typeof page.markdown==='string'?page.markdown:page.markdown?.raw_markdown;
  if(typeof text!=='string'||!text.trim())throw new Error('Crawl4AI 页面没有可读正文');
  return {url:finalUrl,title:page.metadata?.title||finalUrl,text:text.slice(0,30000),observedAt:new Date().toISOString(),reader:'crawl4ai'};
}
