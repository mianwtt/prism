// Synthetic HTML for parser tests only. Never used as live housing data.
export const rentalUrl='https://zu.fang.com/hz/chuzu/3_123456789_1.htm';
export const rentalHtml=`<html><head><title>软件测试公寓小区租房，一室一厅 - 房天下</title><meta property="og:image" content="https://static.soufunimg.com/logo.png"></head><body>
<img src="https://static.soufunimg.com/header.png">
<div class="title">软件测试公寓的整租房源</div>
<div class="trl-item sty1"><i>3200</i>元/月 （押一付一）</div>
<div class="trl-item1 w1"><div class="tt">整租</div><div class="font14">出租方式</div></div>
<div class="trl-item1 w1"><div class="tt">40平米</div><div class="font14">建筑面积</div></div>
<div class="trl-item1 w1"><div class="tt">1室1厅1卫</div><div class="font14">户型</div></div>
<div class="rcont">距离测试线测试地铁站350米</div>
<div class="bigImg"><img imagetype="室内图" src="//cdnsfb.soufunimg.com/fixture-room-a.jpg"><img imagetype="室内图" src="https://cdnsfb.soufunimg.com/fixture-room-b.jpg"><img imagetype="户型图" src="https://imgs.soufunimg.com/fixture-floorplan.jpg"></div>
<div class="recommended"><i>900</i>元/月 推荐其他房源</div></body></html>`;
export const rentalPlan={schema:{label:'租房',optionLabel:'房源',fields:[{key:'rentAmount',label:'月租',unit:'元/月',direction:-1,aliases:['租金']},{key:'floorSpace',label:'建筑面积',unit:'㎡',direction:1},{key:'stationWalk',label:'地铁站距离',unit:'米',direction:-1}]},constraints:[{field:'rentAmount',value:4000,quote:'月租不超过4000元/月'},{field:'floorSpace',value:30,quote:'面积至少30㎡'}],queries:['具体房源详情'],whatifs:[{name:'如果月租放宽到5000元',changes:[{field:'rentAmount',value:5000}]}]};
