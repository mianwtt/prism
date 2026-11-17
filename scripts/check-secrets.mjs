import { execFileSync } from "node:child_process";
const git = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
let paths;
try {
  paths = git(["ls-files", "-z"]).split("\0").filter(Boolean);
} catch {
  console.error(
    "Secret check requires the Git checkout; it cannot verify an exported source folder.",
  );
  process.exitCode = 1;
}
if (paths) {
  const failures = [];
  for (const path of paths) {
    if (
      (/(^|\/)\.env(?:\..*)?$/.test(path) && path !== ".env.example") ||
      /(^|\/)data\//.test(path) ||
      /(^|\/)provider-settings\.json$/.test(path)
    ) {
      failures.push(
        path + ": private configuration or local data must not be tracked",
      );
      continue;
    }
    if (/\.(png|jpg|jpeg|gif|webp|ico|zip|pdf)$/i.test(path)) continue;
    const content = git(["show", ":" + path]);
    if (
      /\b(?:sk-[A-Za-z0-9_-]{16,}|tvly-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b|\brediss?:\/\/[^\s"'`/]*:[^\s"'`@/]+@/.test(
        content,
      )
    )
      failures.push(path + ": possible credential detected");
    if (path === ".env.example") {
      for (const line of content.split(/\r?\n/))
        if (
          /^(?:LLM_BASE_URL|LLM_MODEL|LLM_API_KEY|TAVILY_API_KEY|REDIS_URL)=/.test(
            line,
          ) &&
          line.split("=").slice(1).join("=").trim() !== "XXX"
        )
          failures.push(
            path + ": provider settings in the public template must use XXX",
          );
    }
  }
  if (failures.length) {
    console.error("Secret check failed:\n" + failures.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Git index checked: no private config, local data or recognized credentials found.",
    );
}
