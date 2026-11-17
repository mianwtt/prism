import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { projectRoot, tofuPython } from "../src/tofu-search.mjs";
function run(args) {
  const p = spawnSync("uv", args, {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  if (p.error) throw new Error("请先安装 uv，以便建立独立 Python 搜索环境");
  if (p.status !== 0) process.exit(p.status || 1);
}
const python = tofuPython();
if (!existsSync(python))
  run(["venv", "--python", "3.11", resolve(projectRoot, "work/tofu-venv")]);
run([
  "pip",
  "install",
  "--python",
  python,
  "-r",
  resolve(projectRoot, "scripts/requirements-search.txt"),
]);
console.log(
  "本机搜索环境已准备好；请选择 tofu-search，或设置 SEARCH_PROVIDER=tofu。",
);
