import fs from "node:fs/promises";
import { getProjectPaths } from "../core/paths.js";
import { loadIndex } from "../core/state.js";
import { fileExists } from "../core/fs.js";

export async function statusCommand(opts: { root?: string }) {
  const paths = getProjectPaths(opts.root);
  const index = await loadIndex(paths.indexFile);
  const entries = Object.values(index.raw);
  const ok = entries.filter((e) => e.status === "ok").length;
  const err = entries.filter((e) => e.status === "error").length;

  let lastLogLine = "";
  if (await fileExists(paths.logFile)) {
    const log = await fs.readFile(paths.logFile, "utf-8");
    lastLogLine = log.trim().split("\n").slice(-1)[0] ?? "";
  }

  console.log(
    JSON.stringify(
      {
        rawTracked: Object.keys(index.raw).length,
        compiledOk: ok,
        compiledError: err,
        lastLogLine
      },
      null,
      2
    )
  );
}

