import { compilePipeline } from "../pipelines/compilePipeline.js";

export async function compileCommand(opts: { root?: string; full?: boolean }) {
  const res = await compilePipeline(opts);
  if (res.errors.length) {
    process.exitCode = 1;
  }
}

