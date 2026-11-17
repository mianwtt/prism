import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadSettings} from '../src/config.mjs';
import {providers} from '../src/research-providers.mjs';
const queries=process.argv.slice(2).filter(q=>q!=='--');
if(!queries.length||queries.length>3||queries.some(q=>q.length>500))throw new Error('Usage: npm run probe:research -- "query" ["query"] (max 3)');
const env={...process.env};loadSettings(resolve(env.PRISM_DATA_DIR||'data','provider-settings.json'),env);
const io=providers(env),directory=resolve('work/research-probes',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(directory,{recursive:true});
const results=await Promise.all(queries.map(async query=>{
  const start=Date.now();
  try{const sources=await io.search(query);return {query,status:'completed',ms:Date.now()-start,sources};}
  catch{return {query,status:'failed',ms:Date.now()-start,sources:[]};}
}));
await writeFile(resolve(directory,'sources.json'),JSON.stringify({at:new Date().toISOString(),provider:env.SEARCH_PROVIDER,results},null,2));
const summaries=results.map(({query,status,ms,sources})=>({query,status,seconds:ms/1000,results:sources.length,bodyBearing:sources.filter(s=>String(s.raw_content||'').length>=300).length,sites:[...new Set(sources.map(s=>{try{return new URL(s.url).hostname;}catch{return 'invalid';}}))]}));
console.log(JSON.stringify({summaries,savedUnder:directory,meaning:'Availability probe, not field accuracy or independent corroboration'},null,2));
