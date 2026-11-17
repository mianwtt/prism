import {normalizeMerchantProduct} from '../../src/product-data.mjs';
import {createComparisonSpace} from '../../src/comparison-space.mjs';
export function completeFixture(){
 const rows=[['hp-fixture','惠普 星Book16 (210H/16GB/512GB) test fixture',5199,1.64,'Core 5 210H'],['lenovo-fixture','联想 小新16 (8845H/16GB/512GB) test fixture',4688,1.89,'AMD R7 8845H']];
 const products=rows.map(([key,name,price,weight,cpu],index)=>normalizeMerchantProduct({key,url:`https://m.suning.com/product/000/${index+100}.html`,retrievedAt:new Date().toISOString(),specificationText:`# ${name}\n- CPU型号${cpu}\n- 内存容量16GB\n- 硬盘容量512GB\n- 净重${weight}千克\n- 操作系统Windows 11\n- 屏幕分辨率1920×1200\n- 系列${index?'小新16':'星Book16'}`,images:[{url:`https://example.com/fixture-product-${index}.svg`}],offer:{status:'observed',value:price,quote:`¥${price}.00`,configuration:name,retrievedAt:new Date().toISOString(),snapshot:{text:`Synthetic software fixture, not a real product. ¥${price}.00`}}}));
 return createComparisonSpace({comparisonReady:products,researchDrafts:[]});
}
