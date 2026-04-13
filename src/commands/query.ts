import { queryPipeline } from "../pipelines/queryPipeline.js";

export async function queryCommand(opts: { root?: string; question: string }) {
  await queryPipeline(opts);
}

