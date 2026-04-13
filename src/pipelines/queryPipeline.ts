import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { getProjectPaths } from "../core/paths.js";
import { loadConfig } from "../core/config.js";
import { fileExists, writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { VolcengineProvider } from "../provider/volcengine.js";
import { querySystemPrompt, queryUserPrompt } from "../templates/defaultPrompts.js";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "query"
  );
}

export async function queryPipeline(opts: { root?: string; question: string }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);
  const cfg = await loadConfig(root);

  const hasWiki = await fileExists(paths.wikiDir);
  const wikiFiles = hasWiki ? await globby(["**/*.md"], { cwd: paths.wikiDir, absolute: true }) : [];

  // MVP: keyword count scoring（简单可用，后续可换 BM25/向量）
  const qTokens = opts.question.split(/\s+/).filter(Boolean);
  const scored: Array<{ file: string; score: number; excerpt: string }> = [];

  for (const f of wikiFiles) {
    const text = await fs.readFile(f, "utf-8");
    const lower = text.toLowerCase();
    let score = 0;
    for (const t of qTokens) score += lower.includes(t.toLowerCase()) ? 1 : 0;
    if (score > 0) scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cfg.query.topK);
  const context =
    top.length === 0
      ? "（未找到匹配的 wiki 内容。请先运行 compile，或增加 raw 剪藏后再 compile。）"
      : top
          .map((x) => `## ${path.relative(root, x.file)}\n\n${x.excerpt}`)
          .join("\n\n---\n\n");

  const provider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens
  });

  const out = await provider.generateText({
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

