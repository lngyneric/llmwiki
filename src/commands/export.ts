import { exportPipeline } from "../pipelines/exportPipeline.js";

export async function exportCommand(opts: { root?: string; outDir?: string }) {
  await exportPipeline({ root: opts.root, outDir: opts.outDir });
}

