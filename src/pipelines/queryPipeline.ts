import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { getProjectPaths } from "../core/paths.js";
import { loadConfig } from "../core/config.js";
import { fileExists, writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { loadEmbeddings } from "../core/state.js";
import { VolcengineProvider } from "../provider/volcengine.js";
import { querySystemPrompt, queryUserPrompt, followUpSystemPrompt, followUpUserPrompt } from "../templates/defaultPrompts.js";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "query"
  );
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function queryPipeline(opts: { root?: string; question: string; fetcher?: typeof fetch }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);
  const cfg = await loadConfig(root);

  const wikiDir = path.resolve(root, cfg.paths.wikiDir);
  const hasWiki = await fileExists(wikiDir);
  const wikiFiles = hasWiki ? await globby(["**/*.md"], { cwd: wikiDir, absolute: true }) : [];

  const textProvider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    apiKey: cfg.provider.apiKey,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens,
    fetcher: opts.fetcher
  });

  let embedProvider: VolcengineProvider | null = null;
  if (cfg.embedding?.enabled) {
    embedProvider = new VolcengineProvider({
      model: cfg.embedding.model,
      baseUrl: cfg.embedding.baseUrl,
      apiKey: cfg.embedding.apiKey,
      fetcher: opts.fetcher
    });
  }

  const embeddingsFile = path.join(paths.stateDir, "embeddings.json");
  const embeddingsState = await loadEmbeddings(embeddingsFile);

  const scored: Array<{ file: string; score: number; excerpt: string }> = [];
  let questionVector: number[] | null = null;

  if (embedProvider) {
    try {
      const vectors = await embedProvider.generateEmbeddings([opts.question]);
      if (vectors && vectors.length > 0) {
        questionVector = vectors[0];
      }
    } catch (e) {
      console.error("Failed to embed question, falling back to keyword search", e);
    }
  }

  for (const f of wikiFiles) {
    const text = await fs.readFile(f, "utf-8");
    const relPath = path.relative(root, f).replace(/\\/g, "/");
    let score = 0;

    if (questionVector && embeddingsState[relPath]) {
      // Vector Search
      score = cosineSimilarity(questionVector, embeddingsState[relPath].vector);
      if (score > 0.5) { // Threshold
        scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
      }
    } else {
      // Fallback Keyword Search
      const qTokens = opts.question.split(/\s+/).filter(Boolean);
      const lower = text.toLowerCase();
      for (const t of qTokens) score += lower.includes(t.toLowerCase()) ? 1 : 0;
      if (score > 0) scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cfg.query.topK);
  const context =
    top.length === 0
      ? "（未找到匹配的 wiki 内容。请先运行 compile，或增加 raw 剪藏后再 compile。）"
      : top
          .map((x) => `## ${path.relative(root, x.file)}\n\n${x.excerpt}`)
          .join("\n\n---\n\n");

  const out = await textProvider.generateText({
    system: querySystemPrompt,
    prompt: queryUserPrompt(opts.question, context)
  });

  const ts = new Date();
  const stamp = ts.toISOString().replace(/[-:]/g, "").slice(0, 15); // YYYYMMDDTHHMMSS
  const slug = slugify(opts.question);
  const outRel = path.join("outputs", `${stamp}-${slug}.md`).replace(/\\/g, "/");
  const outAbs = path.join(root, outRel);

  const md = [
    `# 问题：${opts.question}`,
    "",
    `- 生成时间：${ts.toISOString()}`,
    `- 上下文条目数：${top.length}`,
    "",
    "## 答案",
    "",
    out.text.trim(),
    ""
  ].join("\n");

  await writeFileAtomic(outAbs, md);
  await appendLog(paths.logFile, "query", [
    `question: ${opts.question}`,
    `contextItems: ${top.length}`,
    `output: ${outRel}`,
    "status: ok"
  ]);

  return { outputFile: outAbs, outputRel: outRel };
}

export async function followUpPipeline(opts: { root?: string; question: string; historyFilePath: string; fetcher?: typeof fetch }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);
  const cfg = await loadConfig(root);

  const historyAbsPath = path.resolve(root, opts.historyFilePath);
  let historyText = "";
  if (await fileExists(historyAbsPath)) {
    historyText = await fs.readFile(historyAbsPath, "utf-8");
  } else {
    throw new Error("History file not found.");
  }

  const wikiDir = path.resolve(root, cfg.paths.wikiDir);
  const hasWiki = await fileExists(wikiDir);
  const wikiFiles = hasWiki ? await globby(["**/*.md"], { cwd: wikiDir, absolute: true }) : [];

  const textProvider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    apiKey: cfg.provider.apiKey,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens,
    fetcher: opts.fetcher
  });

  let embedProvider: VolcengineProvider | null = null;
  if (cfg.embedding?.enabled) {
    embedProvider = new VolcengineProvider({
      model: cfg.embedding.model,
      baseUrl: cfg.embedding.baseUrl,
      apiKey: cfg.embedding.apiKey,
      fetcher: opts.fetcher
    });
  }

  const embeddingsFile = path.join(paths.stateDir, "embeddings.json");
  const embeddingsState = await loadEmbeddings(embeddingsFile);

  const scored: Array<{ file: string; score: number; excerpt: string }> = [];
  let questionVector: number[] | null = null;

  if (embedProvider) {
    try {
      const vectors = await embedProvider.generateEmbeddings([opts.question]);
      if (vectors && vectors.length > 0) {
        questionVector = vectors[0];
      }
    } catch (e) {
      console.error("Failed to embed question, falling back to keyword search", e);
    }
  }

  for (const f of wikiFiles) {
    const text = await fs.readFile(f, "utf-8");
    const relPath = path.relative(root, f).replace(/\\/g, "/");
    let score = 0;

    if (questionVector && embeddingsState[relPath]) {
      score = cosineSimilarity(questionVector, embeddingsState[relPath].vector);
      if (score > 0.5) {
        scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
      }
    } else {
      const qTokens = opts.question.split(/\s+/).filter(Boolean);
      const lower = text.toLowerCase();
      for (const t of qTokens) score += lower.includes(t.toLowerCase()) ? 1 : 0;
      if (score > 0) scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cfg.query.topK);
  const newContext =
    top.length === 0
      ? "（未找到新的补充资料。）"
      : top
          .map((x) => `## ${path.relative(root, x.file)}\n\n${x.excerpt}`)
          .join("\n\n---\n\n");

  const out = await textProvider.generateText({
    system: followUpSystemPrompt,
    prompt: followUpUserPrompt(historyText, newContext, opts.question)
  });

  const appendText = `\n\n---\n\n## 追问：${opts.question}\n\n${out.text.trim()}`;
  await writeFileAtomic(historyAbsPath, historyText + appendText);

  return { outputRel: opts.historyFilePath };
}

