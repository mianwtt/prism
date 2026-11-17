import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const checker = fileURLToPath(
  new URL("../scripts/check-secrets.mjs", import.meta.url),
);
test("publication guard checks staged content, excludes private files and redacts errors", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "prism-secret-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  const check = () =>
    spawnSync(process.execPath, [checker], {
      cwd: directory,
      encoding: "utf8",
    });
  git("init", "-q");
  await writeFile(
    join(directory, ".env.example"),
    "LLM_API_KEY=XXX\nTAVILY_API_KEY=XXX\n",
  );
  git("add", ".env.example");
  assert.equal(check().status, 0);
  await writeFile(join(directory, ".env"), "PRIVATE=not-a-real-secret\n");
  git("add", ".env");
  assert.equal(check().status, 1);
  git("rm", "--cached", ".env");
  const fake = "sk-" + "a".repeat(24);
  await writeFile(join(directory, "accidental.txt"), fake);
  git("add", "accidental.txt");
  await writeFile(join(directory, "accidental.txt"), "sanitized working copy");
  const failure = check();
  assert.equal(failure.status, 1);
  assert.equal(failure.stderr.includes(fake), false);
  assert.match(failure.stderr, /accidental.txt/);
  git("add", "accidental.txt");
  assert.equal(check().status, 0);
});
