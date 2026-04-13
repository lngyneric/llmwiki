import { getProjectPaths } from "../core/paths.js";
import { appendLog } from "../core/log.js";
import { compilePipeline } from "../pipelines/compilePipeline.js";

export async function compileCommand(opts: { root?: string; full?: boolean }) {
  const paths = getProjectPaths(opts.root);
  try {
    const res = await compilePipeline(opts);
    if (res.errors.length) process.exitCode = 1;
  } catch (e: any) {
    const msg = e?.stack || e?.message || String(e);
    try {
      await appendLog(paths.logFile, "compile", [`status: error`, `error: ${msg}`]);
    } catch {
      // ignore
    }
    process.exitCode = 1;
    throw e;
  }
}
