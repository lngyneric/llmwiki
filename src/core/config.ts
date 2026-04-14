import fs from "node:fs/promises";
import { z } from "zod";
import { getProjectPaths } from "./paths.js";

const ProviderConfigSchema = z.object({
  type: z.literal("volcengine").or(z.literal("openai")),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  temperature: z.number().default(0.2),
  maxTokens: z.number().default(2000)
});

const EmbeddingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.literal("volcengine").or(z.literal("openai")),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional()
});

const PathsConfigSchema = z.object({
  rawDir: z.string().default("raw"),
  wikiDir: z.string().default("wiki"),
  outputsDir: z.string().default("outputs"),
  stateDir: z.string().default(".llm-wiki")
});

const CompileConfigSchema = z.object({
  concurrency: z.number().int().min(1).max(8).default(2)
});

const QueryConfigSchema = z.object({
  topK: z.number().int().min(1).max(50).default(8)
});

export const ConfigSchema = z.object({
  paths: PathsConfigSchema.default({
    rawDir: "raw",
    wikiDir: "wiki",
    outputsDir: "outputs",
    stateDir: ".llm-wiki"
  }),
  provider: ProviderConfigSchema,
  embedding: EmbeddingConfigSchema.optional(),
  compile: CompileConfigSchema.default({ concurrency: 2 }),
  query: QueryConfigSchema.default({ topK: 8 })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(root = process.cwd()): Promise<AppConfig> {
  const paths = getProjectPaths(root);
  const raw = await fs.readFile(paths.configFile, "utf-8");
  const json = JSON.parse(raw);
  return ConfigSchema.parse(json);
}

