import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';
import {setTimeout} from 'node:timers/promises';
const root=fileURLToPath(new URL('../',import.meta.url)),file=new URL('../work/search-service/settings.yml',import.meta.url);
await mkdir(new URL('../work/search-service/',import.meta.url),{recursive:true});
try{await access(file);}catch{
  const settings={use_default_settings:{engines:{keep_only:['bingrss','bing','duckduckgo']}},server:{secret_key:randomBytes(32).toString('hex'),limiter:false,image_proxy:false,bind_address:'0.0.0.0'},search:{safe_search:0,formats:['html','json']},outgoing:{request_timeout:8,max_request_timeout:15},engines:[{name:'bingrss',engine:'prism_bing_rss',shortcut:'brss',categories:['general'],disabled:false,timeout:12},{name:'bing',disabled:true},{name:'duckduckgo',disabled:true}]};
  await writeFile(file,YAML.stringify(settings),{flag:'wx',mode:0o600});
}
const child=spawn('docker',['compose','-p','prism-search','-f','deploy/docker/compose.search.yaml','up','-d'],{cwd:root,stdio:'inherit',windowsHide:true});
const code=await new Promise(resolve=>{child.once('error',()=>{console.error('无法运行 Docker；请启动 Docker Desktop 后重试。');resolve(1);});child.once('exit',code=>resolve(code??1));});
if(code)process.exitCode=code;
else{
  let ready=false;
  for(let attempt=0;attempt<15;attempt++){
    try{const response=await fetch('http://127.0.0.1:4330/search?q=Raspberry%20Pi&format=json&engines=bingrss',{signal:AbortSignal.timeout(15000)});const result=await response.json();if(response.ok&&Array.isArray(result.results)&&!result.unresponsive_engines?.length){ready=true;console.log('SearXNG JSON 检索已验证：'+result.results.length+' 条发现线索。地址：http://127.0.0.1:4330；在研究设置中选择 SearXNG 并填写此地址。');break;}}catch{}
    await setTimeout(1000);
  }
  if(!ready){process.exitCode=1;console.error('容器已启动，但公开搜索尚未通过检查。请运行 docker compose -p prism-search -f deploy/docker/compose.search.yaml logs --tail=40 检查连接。');}
}
