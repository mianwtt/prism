import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export function tofuPython(env = process.env) {
  return (
    env.TOFU_PYTHON ||
    resolve(
      projectRoot,
      process.platform === "win32"
        ? "work/tofu-venv/Scripts/python.exe"
        : "work/tofu-venv/bin/python",
    )
  );
}
export function searchWithTofu(query, env = process.env, {maxResults=8} = {}) {
  if (typeof query !== "string" || !query.trim() || query.length > 500)
    throw new Error("搜索关键词必须为 1–500 字");
  return callTofu({ query, maxResults: Math.min(12, Math.max(4, maxResults)) }, env).then((data) => data.results);
}
export function fetchWithTofu(url, env = process.env) {
  return callTofu({ operation: "fetch", url }, env).then((data) => data.text);
}
export function fetchImagesWithTofu(urls, env = process.env) {
  return callTofu({ operation: "images", urls: urls.slice(0, 6) }, env).then(data => data.images || []);
}
function callTofu(request, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      tofuPython(env),
      [resolve(projectRoot, "scripts/tofu-search.py")],
      {
        cwd: projectRoot,
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"],
        env: { ...process.env, ...env, PYTHONUTF8: "1" },
      },
    );
    let output = "",
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolveResult(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("本机搜索超过 75 秒，已停止等待；请重试或更换搜索服务"));
    }, 75000);
    child.on("error", () =>
      finish(new Error("无法启动本机搜索，请先运行 npm run setup:search")),
    );
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output) > 2_000_000) {
        child.kill();
        finish(new Error("搜索响应过大"));
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      try {
        if (code !== 0) throw new Error("搜索进程异常退出");
        const data = JSON.parse(output);
        if (data.errorType === "ModuleNotFoundError")
          throw new Error("本机搜索依赖未安装，请运行 npm run setup:search");
        if (data.errorType || !Array.isArray(data.results))
          throw new Error("本机搜索未能返回有效结果");
        finish(null, data);
      } catch (error) {
        finish(error);
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
