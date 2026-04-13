import fs from "node:fs/promises";
import { z } from "zod";
import { fileExists, writeFileAtomic } from "./fs.js";

const IndexSchema = z.object({
  version: z.number().default(1),
  raw: z
    .record(
      z.string(),
      z.object({
        sha256: z.string(),
        lastCompiledAt: z.string().optional(),
        status: z.enum(["ok", "error"]).optional(),
        error: z.string().optional()
      })
    )
    .default({})
});

export type IndexState = z.infer<typeof IndexSchema>;

export async function loadIndex(indexFile: string): Promise<IndexState> {
  if (!(await fileExists(indexFile))) return IndexSchema.parse({ version: 1, raw: {} });
  const raw = await fs.readFile(indexFile, "utf-8");
  return IndexSchema.parse(JSON.parse(raw));
}

export async function saveIndex(indexFile: string, state: IndexState): Promise<void> {
  await writeFileAtomic(indexFile, JSON.stringify(state, null, 2));
}
