import {load} from 'cheerio';

const text=($,node)=>$(node).text().replace(/\s+/g,' ').trim();
const absolute=(value,url)=>{if(typeof value!=='string'||!value.trim())return null;try{const u=new URL(value,url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export function retailProfile(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(u.hostname==='www.dfrobot.com.cn'&&/^\/goods-\d+\.html$/.test(u.pathname))return 'dfrobot';
  if(/^(?:www\.)?waveshare\.net$/.test(u.hostname)&&/^\/shop\/[^/]+\.htm$/.test(u.pathname))return 'waveshare';
  return null;
}catch{return null;}}
// Fixed, source-specific DOM scopes. Related-product prices, unselected variants,
// cart totals and recommendation cards are never eligible price selectors.
export function parseRetailProductPage(html,url,{now=new Date().toISOString()}={}){
  const profile=retailProfile(url);if(!profile)return null;const $=load(html),name=text($,$('h1').first());if(!name)return null;
  let brand='',model='',priceElement,availability='unknown',bundle='',bundleQuote='',image=null;
  const attributes=[],support=[];
  if(profile==='dfrobot'){
    const root=$('.goodsMes');if(root.length!==1)return null;
    root.find('.goodsDetial .clearfix').each((_,e)=>{const label=text($,$(e).find('.name').first()),value=text($,$(e).find('.content2').first());if(label==='品牌')brand=value;});
    priceElement=root.find('.comPrice #ECS_SHOPPRICE');
    availability=root.attr('data-stock')==='有货'?'in-stock':root.attr('data-stock')==='无货'?'out-of-stock':'unknown';
    const packed=[...new Set($('p,li').toArray().map(e=>text($,e)).filter(t=>t.length<200&&/[×x]\s*\d+$/i.test(t)))];
    const single=packed.find(t=>t.includes('Raspberry Pi')&&/8\s*GB|4\s*GB|16\s*GB/i.test(t)&&/[×x]\s*1$/i.test(t));
    if(single&&packed.length===1){bundle=single;bundleQuote=single;}
    image=absolute($('#img_url').attr('src'),url);
  }else{
    $('.goods-detail-line').each((_,e)=>{const label=text($,$(e).find('.line-left').first()),value=text($,$(e).find('.line-right').first());if(label==='品牌')brand=value;if(label==='型号')model=value;});
    priceElement=$('.goods-detail-line .sale-price');
    const active=$('.goods-detail-line').toArray().find(e=>text($,$(e).find('.line-left')).includes('套餐选择'));
    bundleQuote=text($,$(active).find('.current_goods'));bundle=bundleQuote;
    image=absolute($('img.cloudzoom').first().attr('src'),url);
  }
  const visible=$('body').clone();visible.find('script,style,noscript').remove();const body=visible.text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
  // The selected title identifies installed RAM. Prose saying "up to 8GB" does not.
  const memory=/(\d+)\s*GB/i.exec(name),raspberry=/Raspberry\s*Pi\s*(?:树莓派\s*)?(\d(?:\s*Model\s*[A-Z])?)/i.exec(name+' '+model);
  const board=Boolean(raspberry)&&!/外壳|散热|风扇|摄像|延长线|扩展板|转接|电源|UPS/i.test(name);
  if(!model&&board)model='Raspberry Pi '+raspberry[1];
  if(memory)attributes.push({label:'内存',value:memory[1]+'GB',quote:name});
  const cpu=$('h1,p,li').toArray().map(e=>text($,e)).find(t=>t.length<300&&/\bBCM\d{4}\b/i.test(t));
  if(cpu)attributes.push({label:'处理器',value:/\bBCM\d{4}\b/i.exec(cpu)[0],quote:cpu});
  if(bundle&&bundleQuote)attributes.push({label:'套餐',value:bundle,quote:bundleQuote});
  if(brand)support.push('品牌：'+brand);if(model)support.push('型号：'+model);
  const quote=priceElement?.length===1?text($,priceElement):'',match=/^[¥￥]\s*([\d,]+(?:\.\d{1,2})?)$/.exec(quote);
  const offers=match?[{price:Number(match[1].replaceAll(',','')),currency:'CNY',seller:profile==='dfrobot'?'DFRobot 创客商城':'微雪电子',quote,basis:'public',conditions:'',availability,shipping:null,raw:$.html(priceElement)}]:[];
  // Data attributes must agree with the visible primary price, when provided.
  if(profile==='dfrobot'&&offers.length&&Number($('.goodsMes').attr('data-price'))!==offers[0].price)offers.length=0;
  const category=board?'single-board-computer':'electronic-component';
  const result={url,title:name,text:[name,...support,...attributes.map(a=>a.quote),quote,'[页面正文]',body].join('\n').slice(0,30000),observedAt:now,reader:profile+'-dom',productObservation:{name,brand,model,category,attributes,offers,image,provenance:'原页固定 DOM 范围；'+profile+'；不采纳关联商品或未选变体'}};
  return result;
}
export function parseRetailCatalog(html,url){
  const $=load(html),items=[],seen=new Set();
  $('a[href]').each((_,e)=>{const target=absolute($(e).attr('href'),url);if(!target||!retailProfile(target)||seen.has(target))return;
    const title=($(e).attr('title')||text($,e)||$(e).find('img').attr('alt')||'').trim();if(title.length<4)return;seen.add(target);items.push({url:target,title:title.slice(0,220)});
  });
  return {url,title:$('title').text().trim(),text:items.map(i=>i.title+'\n'+i.url).join('\n\n'),observedLinks:items.slice(0,40),observedAt:new Date().toISOString()};
}
export function catalogSearchUrl(html,origin,keywords){
  const $=load(html),form=$('form#searchForm').first(),field=form.find('input[name="keywords"]').first();
  if(!form.length||!field.length||(form.attr('method')||'get').toLowerCase()!=='get')throw new Error('未找到公开目录的搜索表单');
  const url=new URL(form.attr('action'),origin);if(url.origin!==new URL(origin).origin)throw new Error('目录表单来源不一致');url.searchParams.set(field.attr('name'),keywords);return url.href;
}
