import path from "node:path";

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
  return {
    root,
    rawDir: path.join(root, "raw"),
    wikiDir: path.join(root, "wiki"),
    outputsDir: path.join(root, "outputs"),
    promptsDir: path.join(root, "prompts"),
    configFile: path.join(root, "config", "llm-wiki.config.json"),
    stateDir: path.join(root, ".llm-wiki"),
    indexFile: path.join(root, ".llm-wiki", "index.json"),
    logFile: path.join(root, "wiki", "log.md")
  };
}

