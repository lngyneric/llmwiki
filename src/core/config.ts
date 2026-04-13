import fs from "node:fs/promises";
import { z } from "zod";
import { getProjectPaths } from "./paths.js";

export const ConfigSchema = z.object({
  paths: z.object({
    rawDir: z.string().default("raw"),
    wikiDir: z.string().default("wiki"),
    outputsDir: z.string().default("outputs"),
    stateDir: z.string().default(".llm-wiki")
  }),
  provider: z.object({
    type: z.literal("volcengine").default("volcengine"),
    model: z.string(),
    baseUrl: z.string().optional(),
    temperature: z.number().default(0.2),
    maxTokens: z.number().default(2000)
  }),
  compile: z
    .object({
      concurrency: z.number().int().min(1).max(8).default(2)
    })
    .default({ concurrency: 2 }),
  query: z
    .object({
      topK: z.number().int().min(1).max(50).default(8)
    })
    .default({ topK: 8 })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(root = process.cwd()): Promise<AppConfig> {
  const paths = getProjectPaths(root);
  const raw = await fs.readFile(paths.configFile, "utf-8");
  const json = JSON.parse(raw);
  return ConfigSchema.parse(json);
}

