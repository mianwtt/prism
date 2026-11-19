// Executed in the browser. Keep the current product's price blocks separate from
// recommendation tiles, coupon totals and the final price after promotions.
export function captureMerchantPage(){
  const prices=[];
  for(const root of document.querySelectorAll('.price-content > div.red-price')){
    const copy=root.cloneNode(true);for(const promotion of copy.querySelectorAll('.final-price'))promotion.remove();
    const raw=copy.textContent.trim();if(raw)prices.push({label:'主标价',raw});
  }
  for(const row of document.querySelectorAll('.price-at-hand .to-hand-price-detail .item')){
    if(row.querySelector('.desc1')?.textContent.trim()!=='易购价')continue;
    const raw=row.querySelector('.val')?.textContent.trim();if(raw)prices.push({label:'易购价',raw});
  }
  return {url:location.href,title:document.title,productTitle:document.querySelector('.price-content .product-title')?.innerText||document.querySelector('#product-name')?.textContent||'',
    priceObservations:prices,text:document.body.innerText.slice(0,18000),
    images:[...document.querySelectorAll('.swiper-container img,.imgZoom img,.pro-img img')].map(i=>i.currentSrc||i.src)};
}
