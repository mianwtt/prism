export function isMerchantProduct(raw){
  let u;try{u=new URL(typeof raw==='string'?raw:raw.url);}catch{return false;}
  const h=u.hostname,p=u.pathname;
  return /(^|\.)jd\.com$/.test(h)&&(/^(?:item|item\.m)\./.test(h)||/ware\/view/.test(p))
    || /(^|\.)suning\.com$/.test(h)&&(/itemcanshu/.test(p)||h.startsWith('product.')||/^\/product\/\d+\/\d+\.html$/.test(p))
    || /(^|\.)vmall\.com$/.test(h)&&/\/product\//.test(p)
    || h==='item.lenovo.com.cn'&&/\/product\//.test(p)
    || /(^|\.)apple\.com\.cn$/.test(h)&&/^\/shop\/(?:buy-|product)/.test(p)
    || /^(?:detail(?:\.m)?\.tmall|item\.taobao)\.com$/.test(h)&&/item/.test(p)
    || h==='h5.m.taobao.com'&&/\/awp\/core\/detail/.test(p)
    || /(^|\.)hpstore\.cn$/.test(h)&&/product|item/.test(p);
}
export function merchantPlatform(raw){
 let h='';try{h=new URL(typeof raw==='string'?raw:raw.url).hostname;}catch{return '未知平台';}
 for(const [domain,label]of [['tmall.com','天猫'],['taobao.com','淘宝'],['jd.com','京东'],['suning.com','苏宁'],['vmall.com','华为商城'],['lenovo.com.cn','联想商城'],['apple.com.cn','Apple 商店'],['hpstore.cn','惠普商城']])if(h===domain||h.endsWith('.'+domain))return label;
 return h;
}
export function isNewsSource(source){
  if(isMerchantProduct(source))return false;
  let h='';try{h=new URL(source.url).hostname;}catch{}
  return /(^|\.)(?:sohu\.com|news\.qq\.com|post\.smzdm\.com|nb\.zol\.com\.cn)$/.test(h)
    || /发布|上市|发布会|评测|选购攻略|推荐指南/i.test(source.title||'');
}
