import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const dir of ["src", "public", "scripts", "tests"]) {
  for (const file of await readdir(
    new URL("../" + dir + "/", import.meta.url),
    { recursive: true },
  )) {
    if (!file.endsWith(".mjs")) continue;
    const result = spawnSync(process.execPath, ["--check", dir + "/" + file], {
      stdio: "inherit",
      cwd: root,
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log("All JavaScript syntax checks passed.");
await import("./check-project.mjs");
