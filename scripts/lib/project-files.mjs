import {lstat,readdir,readFile,realpath} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {init,parse} from 'es-module-lexer';

await init();

export const SOURCE_ENTRIES=['src','public','scripts','tests','examples','docs','.github','.githooks','package.json','package-lock.json','playwright.config.mjs','README.md','README.zh-CN.md','LICENSE','CONTRIBUTING.md','SECURITY.md','requirements-search.txt','Dockerfile','compose.yaml','.dockerignore','.gitignore','.gitattributes','.editorconfig','.nvmrc'];
const REQUIRED=['package.json','package-lock.json','README.md','README.zh-CN.md','LICENSE','.env.example','src/server.mjs','public/index.html'];
const SKIP=new Set(['.git','node_modules','data','work','test-results','playwright-report','__pycache__','.DS_Store']);
const binary=/\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf)$/i;
const secret=/\b(?:sk-[A-Za-z0-9_-]{16,}|tvly-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const portable=path=>path.replaceAll('\\','/');
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function inside(root,path){const part=relative(root,path);return Boolean(part)&&!part.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&part!=='..'&&!isAbsolute(part);}
export class ProjectCheckError extends Error{constructor(issues){super('Project file check failed:\n'+issues.join('\n'));this.issues=issues;}}

export async function collectSourceFiles(directory){
 const root=await realpath(resolve(directory)),files=[];
 async function walk(path){
  if(!inside(root,path))throw new ProjectCheckError(['Source path must stay inside the project']);
  const name=portable(relative(root,path)),info=await lstat(path);
  if(info.isSymbolicLink())throw new ProjectCheckError([name+': source symlinks are not allowed']);
  if(info.isDirectory()){for(const child of (await readdir(path)).sort()){if(SKIP.has(child)||/\.py[co]$/.test(child))continue;await walk(resolve(path,child));}return;}
  if(!info.isFile())throw new ProjectCheckError([name+': unsupported source entry']);
  if((/(^|\/)\.env(?:\..*)?$/.test(name)&&name!=='.env.example')||/(^|\/)provider-settings\.json$/.test(name))throw new ProjectCheckError([name+': private configuration cannot be packaged']);
  const bytes=await readFile(path);files.push({path:name,bytes,size:bytes.length,sha256:sha256(bytes)});
 }
 for(const entry of [...SOURCE_ENTRIES,'.env.example']){const path=resolve(root,entry);try{await lstat(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}await walk(path);}
 return {root,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
}

function markdownAnchors(text){
 const ids=new Set([...text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)].map(m=>m[1])),counts=new Map();let code=false;
 for(const line of text.split(/\r?\n/)){
  if(/^\s*```/.test(line)){code=!code;continue;}if(code)continue;
  const match=/^#{1,6}\s+(.+)$/.exec(line);if(!match)continue;
  const slug=match[1].toLowerCase().replace(/<[^>]*>/g,'').replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s/g,'-'),count=counts.get(slug)||0;counts.set(slug,count+1);ids.add(slug+(count?'-'+count:''));
 }
 return ids;
}

export async function auditProject(directory,{checkIndex=false}={}){
 const snapshot=await collectSourceFiles(directory),{root,files}=snapshot,byPath=new Map(files.map(file=>[file.path,file])),issues=[];
 let imports=0,documentLinks=0,assetReferences=0;
 for(const name of REQUIRED)if(!byPath.has(name))issues.push(name+': required source file missing');
 for(const file of files){
  if(binary.test(file.path))continue;
  const text=file.bytes.toString('utf8');
  if(secret.test(text))issues.push(file.path+': possible credential detected');
  if(file.path==='.env.example')for(const line of text.split(/\r?\n/))if(/^(?:LLM_BASE_URL|LLM_MODEL|LLM_API_KEY|TAVILY_API_KEY|SEARCH_PROVIDER)=/.test(line)&&line.split('=').slice(1).join('=').trim()!=='XXX')issues.push(file.path+': public provider values must use XXX');
  if(file.path.endsWith('.mjs')){
   try{
    for(const record of parse(text)[0]){
     if(!record.specifier?.startsWith('.'))continue;
     imports++;const target=portable(relative(root,resolve(dirname(resolve(root,file.path)),decodeURIComponent(record.specifier.split(/[?#]/)[0]))));
     if(!byPath.has(target))issues.push(file.path+': unresolved literal relative import near line '+text.slice(0,record.importStart).split('\n').length);
    }
   }catch{issues.push(file.path+': cannot parse module imports');}
  }
  if(file.path.endsWith('.md')){
   const references=[...text.matchAll(/\]\(([^\s)]+)\)/g),...text.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)];
   for(const match of references){
    const value=match[1];if(/^(?:https?:|mailto:|data:)/i.test(value))continue;documentLinks++;
    const [path,fragment]=value.split('#');let target;
    try{target=path?portable(relative(root,resolve(dirname(resolve(root,file.path)),decodeURIComponent(path)))):file.path;}catch{issues.push(file.path+': malformed local documentation link');continue;}
    const destination=byPath.get(target);
    if(!destination)issues.push(file.path+': missing local documentation target near line '+text.slice(0,match.index).split('\n').length);
    else if(fragment&&extname(destination.path)==='.md'){
     try{if(!markdownAnchors(destination.bytes.toString('utf8')).has(decodeURIComponent(fragment)))issues.push(file.path+': missing documentation anchor near line '+text.slice(0,match.index).split('\n').length);}
     catch{issues.push(file.path+': malformed local documentation anchor');}
    }
   }
  }
  if(file.path==='src/server.mjs')for(const match of text.matchAll(/["']((?:public|src)\/[^"']+\.(?:mjs|css|html|svg))["']/g)){assetReferences++;if(!byPath.has(match[1]))issues.push(file.path+': static asset missing from source package');}
 }
 let pkg,lock;
 try{pkg=JSON.parse(byPath.get('package.json')?.bytes.toString('utf8'));lock=JSON.parse(byPath.get('package-lock.json')?.bytes.toString('utf8'));}catch{issues.push('Package metadata must be valid JSON');}
 if(pkg&&lock){
  if(pkg.name!==lock.name||pkg.version!==lock.version||pkg.version!==lock.packages?.['']?.version)issues.push('package.json and package-lock.json name/version do not agree');
  for(const group of ['dependencies','devDependencies'])if(JSON.stringify(Object.entries(pkg[group]||{}).sort())!==JSON.stringify(Object.entries(lock.packages?.['']?.[group]||{}).sort()))issues.push('package.json and package-lock.json '+group+' do not agree');
 }
 if(checkIndex){
  try{
   const top=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
   if(relative(root,await realpath(top))!=='')throw new Error('Source directory is not the Git root');
   const indexed=execFileSync('git',['ls-files','--stage','-z'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}),entries=new Map(indexed.split('\0').filter(Boolean).map(line=>{const match=/^(\d+) (\w+) (\d)\t([\s\S]+)$/.exec(line);return match?[match[4],{mode:match[1],hash:match[2],stage:match[3]}]:[];}));
   for(const file of files){const entry=entries.get(file.path);if(!entry){issues.push(file.path+': source file is not in the Git index');continue;}if(entry.mode==='120000'||entry.stage!=='0'){issues.push(file.path+': invalid or conflicted index entry');continue;}
    const hash=execFileSync('git',['hash-object','--path='+file.path,'--stdin'],{cwd:root,input:file.bytes,stdio:['pipe','pipe','pipe']}).toString().trim();if(hash!==entry.hash)issues.push(file.path+': working copy differs from staged source');
   }
   for(const path of entries.keys())if(!byPath.has(path))issues.push(path+': staged path is outside the current source package');
  }catch(error){if(error instanceof ProjectCheckError)throw error;issues.push('Cannot verify the Git index for this source directory');}
 }
 if(issues.length)throw new ProjectCheckError([...new Set(issues)]);
 return {...snapshot,package:pkg,summary:{files:files.length,relativeImports:imports,documentLinks,staticAssets:assetReferences,indexChecked:checkIndex}};
}
