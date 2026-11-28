import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { tofuPython } from "./tofu-search.mjs";
const fields = [
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_API_KEY",
  "TAVILY_API_KEY",
  "SEARCH_PROVIDER",
  "TOFU_PYTHON",
  "SEARXNG_URL",
];
export function configuredSearxngUrl(raw){try{const u=new URL(raw);return !u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))?u.href.replace(/\/$/,''):'';}catch{return '';}}
export function configured(value) {
  return (
    typeof value === "string" &&
    Boolean(value.trim()) &&
    !/^(?:x{3,}|placeholder|change[-_ ]?me|your[-_ ].*)$/i.test(value.trim())
  );
}
export function publicSettings(env) {
  const searchProvider = ['tofu','searxng'].includes(env.SEARCH_PROVIDER)?env.SEARCH_PROVIDER:'tavily';
  const tofuAvailable = existsSync(tofuPython(env));
  return {
    baseUrl: env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: env.LLM_MODEL || "",
    hasModelKey: configured(env.LLM_API_KEY),
    hasSearchKey: configured(env.TAVILY_API_KEY),
    searchProvider,
    tofuAvailable,
    searxngUrl:configuredSearxngUrl(env.SEARXNG_URL||env.TOFU_SEARCH_SEARXNG_URL),
    ready:
      [env.LLM_API_KEY, env.LLM_MODEL].every(configured) &&
      (searchProvider === 'searxng'?Boolean(configuredSearxngUrl(env.SEARXNG_URL||env.TOFU_SEARCH_SEARXNG_URL)):searchProvider === "tofu"
        ? tofuAvailable
        : configured(env.TAVILY_API_KEY)),
  };
}
export function loadSettings(file, env) {
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    for (const key of fields)
      if (typeof saved[key] === "string") env[key] = saved[key];
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error("本机研究配置无法读取，请检查配置文件格式");
  }
}
export async function saveSettings(file, input, current) {
  const next = { ...current };
  if (
    input.searchProvider !== undefined &&
    !["tofu", "tavily", "searxng"].includes(input.searchProvider)
  )
    throw new Error("请选择受支持的搜索服务");
  next.SEARCH_PROVIDER =
    input.searchProvider || current.SEARCH_PROVIDER || "tavily";
  if(input.searxngUrl!==undefined){if(typeof input.searxngUrl!=='string'||input.searxngUrl.length>2000)throw new Error('SearXNG 地址无效');next.SEARXNG_URL=input.searxngUrl.trim();}
  for (const [field, key] of [
    ["baseUrl", "LLM_BASE_URL"],
    ["model", "LLM_MODEL"],
    ["modelKey", "LLM_API_KEY"],
    ["searchKey", "TAVILY_API_KEY"],
  ]) {
    if (
      typeof input[field] !== "string" ||
      input[field].length > 4000 ||
      /[\r\n\0]/.test(input[field])
    )
      throw new Error("配置值无效，请检查输入");
    const value = input[field].trim();
    if ((field === "modelKey" || field === "searchKey") && !value) continue;
    next[key] = value;
  }
  let url;
  try {
    url = new URL(next.LLM_BASE_URL);
  } catch {
    throw new Error("请输入完整的模型服务地址，例如 https://api.openai.com/v1");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("模型地址必须使用 HTTPS；本机模型可使用 HTTP");
  if (![next.LLM_MODEL, next.LLM_API_KEY].every(configured))
    throw new Error(
      "请填写模型名称与模型密钥；本机 Ollama 的密钥可填写 ollama，XXX 为未配置占位值",
    );
  if(next.SEARCH_PROVIDER==='searxng'&&!configuredSearxngUrl(next.SEARXNG_URL||next.TOFU_SEARCH_SEARXNG_URL))throw new Error('请填写支持 JSON 搜索的 SearXNG HTTPS 地址；本机服务可使用 HTTP');
  if (next.SEARCH_PROVIDER === "tavily" && !configured(next.TAVILY_API_KEY))
    throw new Error(
      "Tavily 需要有效搜索密钥；也可以选择无需商业搜索密钥的本机 tofu-search",
    );
  if (next.SEARCH_PROVIDER === "tofu" && !existsSync(tofuPython(next)))
    throw new Error("未找到本机搜索环境，请先运行 npm run setup:search");
  const saved = Object.fromEntries(fields.map((k) => [k, next[k]]));
  await mkdir(dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(saved, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temp, file);
  Object.assign(current, saved);
  return publicSettings(current);
}
