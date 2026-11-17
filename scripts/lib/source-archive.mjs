import {mkdir,writeFile,readFile,rename,rm,realpath,lstat,open,unlink} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {auditProject,inside,sha256} from './project-files.mjs';

export async function buildSourceArchive(directory){
 const snapshot=await auditProject(directory),root=snapshot.root,version=snapshot.package.version;
 if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(version))throw new Error('Package version is not safe for a source archive name');
 // Check each existing parent before creating anything below it.
 let output=root;
 for(const segment of ['work','releases']){
  output=resolve(output,segment);
  const info=await lstat(output).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(info&&(info.isSymbolicLink()||!info.isDirectory()))throw new Error('Source archive output cannot use redirected directories');
  if(!info)await mkdir(output);
 }
 const actualOutput=await realpath(output);
 if(!inside(root,actualOutput)||relative(output,actualOutput)!=='')throw new Error('Source archive output must stay inside the project without redirected directories');
 const lockPath=resolve(output,'.source-build.lock');let lock;
 try{lock=await open(lockPath,'wx');}
 catch(error){if(error.code==='EEXIST')throw new Error('A source archive build is already running; an interrupted build may leave work/releases/.source-build.lock for inspection');throw error;}
 const stage=resolve(output,'.stage-'+randomUUID()),prefix='prism-'+version;
 const archive=resolve(output,prefix+'-source.tar.gz'),temporary=resolve(stage,'source.tar.gz');
 const manifest={name:snapshot.package.name,version,generatedAt:new Date().toISOString(),kind:'working-tree-source',files:snapshot.files.map(({path,size,sha256})=>({path,size,sha256})),note:'Includes checked working-tree source. This is not a signed release or remote-CI result.'};
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n');
  await mkdir(resolve(stage,prefix),{recursive:true});
  for(const file of snapshot.files){const target=resolve(stage,prefix,file.path);if(!inside(resolve(stage,prefix),target))throw new Error('Invalid source archive member');await mkdir(dirname(target),{recursive:true});await writeFile(target,file.bytes);}
  await writeFile(resolve(stage,prefix,'SOURCE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  const expected=[...snapshot.files.map(file=>prefix+'/'+file.path),prefix+'/SOURCE-MANIFEST.json'],list=resolve(stage,'files.txt');await writeFile(list,expected.join('\n')+'\n');
  const run=args=>{const p=spawnSync('tar',args,{encoding:'utf8',windowsHide:true});if(p.error||p.status!==0)throw new Error('Source archive operation failed; ensure the system tar command is available');return p.stdout;};
  run(['-czf',temporary,'-C',stage,'-T',list]);
  const actual=run(['-tzf',temporary]).split(/\r?\n/).filter(Boolean).map(s=>s.replaceAll('\\','/'));
  if(actual.length!==expected.length||actual.some(path=>!expected.includes(path)))throw new Error('Source archive contents do not match the checked file list');
  const stored=JSON.parse(run(['-xOzf',temporary,prefix+'/SOURCE-MANIFEST.json']));if(JSON.stringify(stored)!==JSON.stringify(manifest))throw new Error('Source manifest did not survive archive round trip');
  const bytes=await readFile(temporary),hash=sha256(bytes),checksum=resolve(stage,'source.sha256');
  await writeFile(checksum,hash+'  '+prefix+'-source.tar.gz\n');
  await rename(temporary,archive);await rename(checksum,archive+'.sha256');
  return {archive,sha256:hash,bytes:bytes.length,files:snapshot.files.length,manifest:prefix+'/SOURCE-MANIFEST.json'};
 }finally{
  // This is an explicit generated staging directory, checked before recursive removal.
  try{
   if(!inside(output,stage)||!stage.startsWith(resolve(output,'.stage-')))throw new Error('Refusing staging cleanup outside the generated archive directory');
   await rm(stage,{recursive:true,force:true});
  }finally{
   await lock.close();await unlink(lockPath);
  }
 }
}
