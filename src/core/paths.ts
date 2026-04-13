import path from "node:path";
import fs from "node:fs";

export type ProjectPaths = {
  root: string;
  rawDir: string;
  wikiDir: string;
  outputsDir: string;
  promptsDir: string;
  configFile: string;
  stateDir: string;
  indexFile: string;
  logFile: string;
};

export function getProjectPaths(root = process.cwd()): ProjectPaths {
  const configFile = path.join(root, "config", "llm-wiki.config.json");
  let wikiDir = path.join(root, "wiki");
  
  // Try to load wikiDir from config if it exists
  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      if (config.paths && config.paths.wikiDir) {
        wikiDir = path.resolve(root, config.paths.wikiDir);
      }
    }
  } catch (e) {
    // Ignore parse errors, use default
  }

  return {
    root,
    rawDir: path.join(root, "raw"),
    wikiDir,
    outputsDir: path.join(root, "outputs"),
    promptsDir: path.join(root, "prompts"),
    configFile,
    stateDir: path.join(root, ".llm-wiki"),
    indexFile: path.join(root, ".llm-wiki", "index.json"),
    logFile: path.join(root, "wiki", "log.md")
  };
}

