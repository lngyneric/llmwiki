import path from "node:path";
import { getProjectPaths } from "../core/paths.js";
import { lintPipeline } from "../pipelines/lintPipeline.js";
import { writeFileAtomic } from "../core/fs.js";

export async function lintCommand(opts: { root?: string; dir?: string; json?: string; md?: string }) {
  const paths = getProjectPaths(opts.root);
  const res = await lintPipeline({ root: paths.root, dir: opts.dir });
  const jsonPath = opts.json ? path.resolve(paths.root, opts.json) : path.join(paths.root, "export", "lint-report.json");
  const mdPath = opts.md ? path.resolve(paths.root, opts.md) : path.join(paths.root, "export", "lint-report.md");

  await writeFileAtomic(jsonPath, JSON.stringify(res, null, 2));

  const md = [
    "# Export Lint Report",
    "",
    `errors: ${res.errors.length}`,
    `warnings: ${res.warnings.length}`,
    "",
    "## Errors",
    ...(res.errors.length ? res.errors.map((e) => `- ${e.file} (${e.ruleId}): ${e.message}`) : ["- none"]),
    "",
    "## Warnings",
    ...(res.warnings.length ? res.warnings.map((e) => `- ${e.file} (${e.ruleId}): ${e.message}`) : ["- none"]),
    ""
  ].join("\n");
  await writeFileAtomic(mdPath, md);

  if (res.errors.length) process.exitCode = 1;
}

