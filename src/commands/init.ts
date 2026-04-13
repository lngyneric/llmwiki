import path from "node:path";
import { getProjectPaths } from "../core/paths.js";
import { ensureDir, fileExists, writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { defaultConfigJson } from "../templates/defaultConfig.js";

export async function initCommand(opts: { root?: string; model?: string }) {
  const paths = getProjectPaths(opts.root);
  await ensureDir(paths.rawDir);
  await ensureDir(paths.wikiDir);
  await ensureDir(paths.outputsDir);
  await ensureDir(paths.promptsDir);
  await ensureDir(path.dirname(paths.configFile));
  await ensureDir(paths.stateDir);

  if (!(await fileExists(paths.configFile))) {
    await writeFileAtomic(paths.configFile, defaultConfigJson(opts.model));
  }

  if (!(await fileExists(paths.logFile))) {
    await writeFileAtomic(paths.logFile, "# LLM Wiki Log\n\n");
  }

  await appendLog(paths.logFile, "init", [
    `root: ${paths.root}`,
    "created: raw/, wiki/, outputs/, prompts/, config/, .llm-wiki/",
    `config: ${path.relative(paths.root, paths.configFile)}`
  ]);
}

