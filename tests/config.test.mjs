import test from "node:test";
import assert from "node:assert/strict";
import { publicSettings,saveSettings } from "../src/config.mjs";
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import { liveConfigured } from "../src/research.mjs";
test("XXX placeholders are never considered valid provider credentials", () => {
  const env = {
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "qwen3.5:9b",
    LLM_API_KEY: "ollama",
    TAVILY_API_KEY: "XXX",
  };
  assert.equal(publicSettings(env).hasModelKey, true);
  assert.equal(publicSettings(env).hasSearchKey, false);
  assert.equal(liveConfigured(env), false);
  assert.equal(liveConfigured({ ...env, TAVILY_API_KEY: "test-key" }), true);
});
test('SearXNG can be the only search provider without tofu or a commercial search key',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'prism-searxng-')),env={};
  try{const status=await saveSettings(join(directory,'settings.json'),{baseUrl:'http://localhost:11434/v1',model:'test-qwen',modelKey:'ollama',searchKey:'',searchProvider:'searxng',searxngUrl:'http://127.0.0.1:8080/search'},env);assert.equal(status.ready,true);assert.equal(status.hasSearchKey,false);assert.equal(status.searchProvider,'searxng');assert.equal(JSON.parse(await readFile(join(directory,'settings.json'),'utf8')).SEARXNG_URL,env.SEARXNG_URL);}finally{await rm(directory,{recursive:true,force:true});}
});
test('SearXNG setup rejects missing, credential-bearing and insecure remote service addresses',()=>{
  const model={LLM_MODEL:'qwen',LLM_API_KEY:'ollama',SEARCH_PROVIDER:'searxng'};
  for(const address of [undefined,'https://user:pass@search.example.com','http://search.example.com','https://search.example.com/?token=secret'])assert.equal(publicSettings({...model,SEARXNG_URL:address}).ready,false);
  assert.equal(publicSettings({...model,SEARXNG_URL:'https://search.example.com'}).ready,true);
});
