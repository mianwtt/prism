import {isMerchantProduct,merchantPlatform} from './source-types.mjs';
export function assessPurchaseComparison(productKey,offers){
 const observations=offers.map(offer=>{
  const blockers=[];
  if(!productKey||offer.productKey!==productKey)blockers.push('未确认同一厂家型号');
  if(offer.kind!=='merchant-listed'||!Number.isFinite(offer.value)||offer.value<=0)blockers.push('未取得商家数值标价');
  if(!isMerchantProduct(offer.url))blockers.push('不是商家商品页');
  const time=Date.parse(offer.retrievedAt);
  if(!Number.isFinite(time)||Date.now()-time>86400000||time>Date.now()+60000)blockers.push('缺少当天采集时间');
  return {...offer,platform:merchantPlatform(offer.url),accepted:!blockers.length,blockers,notes:[offer.availability==='out-of-stock'?'页面显示无货':null,!offer.region?'地区未记录':null,offer.termsVerified!==true?'优惠条件尚未核对':null].filter(Boolean)};
 });
 const platforms=new Set(observations.filter(o=>o.accepted).map(o=>o.platform));
 return {status:platforms.size>=2?'passed':'failed',productKey,acceptedPlatforms:[...platforms],observations,
  reason:platforms.size>=2?'同厂家型号已取得两个平台可比较的页面报价':'尚未取得两个平台同型号的数值页面报价；库存不作为采集门槛'};
}
