import { getProjectPaths } from "../core/paths.js";
import { appendLog } from "../core/log.js";
import { queryPipeline } from "../pipelines/queryPipeline.js";

export async function queryCommand(opts: { root?: string; question: string }) {
  const paths = getProjectPaths(opts.root);
  try {
    await queryPipeline(opts);
  } catch (e: any) {
    const msg = e?.stack || e?.message || String(e);
    try {
      await appendLog(paths.logFile, "query", [
        `question: ${opts.question}`,
        `status: error`,
        `error: ${msg}`
      ]);
    } catch {
      // ignore
    }
    process.exitCode = 1;
    throw e;
  }
}
