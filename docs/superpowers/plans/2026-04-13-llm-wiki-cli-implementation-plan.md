# LLM Wiki CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js/TypeScript CLI that initializes a llm-wiki project, incrementally compiles `raw/` → `wiki/`, answers questions via `query` and persists results to `outputs/`, with append-only logs in `wiki/log.md`.

**Architecture:** A small CLI app with (1) config loader, (2) state/index store for raw hashes & compile status, (3) provider abstraction + Volcengine provider, (4) compiler and query pipelines that always write to disk and log every run.

**Tech Stack:** Node.js 20+, TypeScript, `commander` (CLI), `zod` (config validation), `globby` (file scan), `gray-matter` (frontmatter), `vitest` (tests), `tsx` (dev runner).

---

## File structure (new project)

**Files:**
- Create:
  - `package.json`
  - `tsconfig.json`
  - `README.md`
  - `src/cli.ts`
  - `src/commands/init.ts`
  - `src/commands/compile.ts`
  - `src/commands/query.ts`
  - `src/commands/status.ts`
  - `src/core/paths.ts`
  - `src/core/config.ts`
  - `src/core/log.ts`
  - `src/core/state.ts`
  - `src/core/hash.ts`
  - `src/core/fs.ts`
  - `src/provider/provider.ts`
  - `src/provider/volcengine.ts`
  - `src/pipelines/compilePipeline.ts`
  - `src/pipelines/queryPipeline.ts`
  - `src/templates/defaultConfig.ts`
  - `src/templates/defaultPrompts.ts`
  - `tests/config.test.ts`
  - `tests/state.test.ts`
  - `tests/init.e2e.test.ts`

> Notes:
> - This plan assumes we work inside the user-selected folder (the project root).
> - If the folder is not a git repository, Task 1 includes `git init` so later commit steps work.

---

### Task 1: Bootstrap repository & toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `README.md`, `src/cli.ts`

- [ ] **Step 1: Initialize npm + git**

Run:
```bash
npm init -y
git init
```

Expected: `package.json` created, `.git/` created.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm i commander zod globby gray-matter
npm i -D typescript tsx vitest @types/node
```

Expected: `node_modules/` installed, `package-lock.json` created.

- [ ] **Step 3: Add TypeScript config**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Wire scripts + bin**

Modify `package.json`:
```json
{
  "name": "llm-wiki",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "llm-wiki": "dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Add minimal CLI entry**

Create `src/cli.ts`:
```ts
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("llm-wiki")
  .description("LLM Wiki CLI (raw → wiki compiler)")
  .version("0.0.1");

program
  .command("help")
  .description("Show help")
  .action(() => program.outputHelp());

program.parse();
```

- [ ] **Step 6: Build once**

Run:
```bash
npm run build
node dist/cli.js help
```

Expected: prints help text, exit code 0.

- [ ] **Step 7: Commit**

Run:
```bash
git add package.json package-lock.json tsconfig.json src/cli.ts
git commit -m "chore: bootstrap ts cli"
```

---

### Task 2: Implement path/config/state/log primitives (TDD)

**Files:**
- Create: `src/core/paths.ts`, `src/core/config.ts`, `src/core/state.ts`, `src/core/log.ts`, `src/core/hash.ts`, `src/core/fs.ts`
- Create tests: `tests/config.test.ts`, `tests/state.test.ts`

- [ ] **Step 1: Add path resolver**

Create `src/core/paths.ts`:
```ts
import path from "node:path";

export type ProjectPaths = {
  root: string;
  rawDir: string;
  wikiDir: string;
  outputsDir: string;
  promptsDir: string;
  configFile: string;
  stateDir: string;
  indexFile: string;
  logFile: string;
};

export function getProjectPaths(root = process.cwd()): ProjectPaths {
  return {
    root,
    rawDir: path.join(root, "raw"),
    wikiDir: path.join(root, "wiki"),
    outputsDir: path.join(root, "outputs"),
    promptsDir: path.join(root, "prompts"),
    configFile: path.join(root, "config", "llm-wiki.config.json"),
    stateDir: path.join(root, ".llm-wiki"),
    indexFile: path.join(root, ".llm-wiki", "index.json"),
    logFile: path.join(root, "wiki", "log.md")
  };
}
```

- [ ] **Step 2: Add small fs helpers**

Create `src/core/fs.ts`:
```ts
import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFileAtomic(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, filePath);
}

export async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Add hashing**

Create `src/core/hash.ts`:
```ts
import crypto from "node:crypto";
import fs from "node:fs/promises";

export async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}
```

- [ ] **Step 4: Implement config schema + loader**

Create `src/core/config.ts`:
```ts
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
  compile: z.object({
    concurrency: z.number().int().min(1).max(8).default(2)
  }).default({ concurrency: 2 }),
  query: z.object({
    topK: z.number().int().min(1).max(50).default(8)
  }).default({ topK: 8 })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(root = process.cwd()): Promise<AppConfig> {
  const paths = getProjectPaths(root);
  const raw = await fs.readFile(paths.configFile, "utf-8");
  const json = JSON.parse(raw);
  return ConfigSchema.parse(json);
}
```

- [ ] **Step 5: Write failing config test**

Create `tests/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ConfigSchema } from "../src/core/config.js";

describe("ConfigSchema", () => {
  it("parses minimal config", () => {
    const cfg = ConfigSchema.parse({
      paths: {},
      provider: { type: "volcengine", model: "m" }
    });
    expect(cfg.provider.model).toBe("m");
    expect(cfg.compile.concurrency).toBe(2);
  });
});
```

- [ ] **Step 6: Implement state/index store + tests**

Create `src/core/state.ts`:
```ts
import fs from "node:fs/promises";
import { z } from "zod";
import { fileExists, writeFileAtomic } from "./fs.js";

const IndexSchema = z.object({
  version: z.number().default(1),
  raw: z.record(
    z.object({
      sha256: z.string(),
      lastCompiledAt: z.string().optional(),
      status: z.enum(["ok", "error"]).optional(),
      error: z.string().optional()
    })
  ).default({})
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
```

Create `tests/state.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { loadIndex, saveIndex } from "../src/core/state.js";

describe("index store", () => {
  it("roundtrips", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-"));
    const file = path.join(dir, "index.json");
    const s1 = await loadIndex(file);
    s1.raw["raw/a.md"] = { sha256: "x", status: "ok" };
    await saveIndex(file, s1);
    const s2 = await loadIndex(file);
    expect(s2.raw["raw/a.md"].sha256).toBe("x");
  });
});
```

- [ ] **Step 7: Implement append-only log writer**

Create `src/core/log.ts`:
```ts
import fs from "node:fs/promises";
import { ensureDir } from "./fs.js";
import path from "node:path";

export async function appendLog(logFile: string, title: string, lines: string[]) {
  await ensureDir(path.dirname(logFile));
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  const body = [
    `## ${ts} ${title}`,
    ...lines.map((l) => `- ${l}`),
    "",
  ].join("\n");
  await fs.appendFile(logFile, body, "utf-8");
}
```

- [ ] **Step 8: Run tests**

Run:
```bash
npm test
```
Expected: PASS.

- [ ] **Step 9: Commit**

Run:
```bash
git add src/core tests
git commit -m "feat: add config/state/log primitives"
```

---

### Task 3: Provider abstraction + Volcengine provider (MVP)

**Files:**
- Create: `src/provider/provider.ts`, `src/provider/volcengine.ts`

- [ ] **Step 1: Define provider interface**

Create `src/provider/provider.ts`:
```ts
export type GenerateTextInput = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateTextOutput = {
  text: string;
  raw?: unknown;
};

export interface LlmProvider {
  name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}
```

- [ ] **Step 2: Implement Volcengine provider (OpenAI-compatible placeholder)**

Create `src/provider/volcengine.ts`:
```ts
import { LlmProvider, GenerateTextInput, GenerateTextOutput } from "./provider.js";

/**
 * NOTE:
 * - If Volcengine is OpenAI-compatible, set VOLC_BASE_URL and VOLC_API_KEY.
 * - If not compatible, replace fetch body/headers accordingly.
 */
export class VolcengineProvider implements LlmProvider {
  name = "volcengine";
  constructor(
    private cfg: { model: string; baseUrl?: string; temperature: number; maxTokens: number }
  ) {}

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const baseUrl = this.cfg.baseUrl ?? process.env.VOLC_BASE_URL ?? "";
    const apiKey = process.env.VOLC_API_KEY ?? "";
    if (!baseUrl || !apiKey) {
      throw new Error("Missing VOLC_BASE_URL or VOLC_API_KEY");
    }

    const resp = await fetch(`${baseUrl.replace(/\\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.model,
        temperature: input.temperature ?? this.cfg.temperature,
        max_tokens: input.maxTokens ?? this.cfg.maxTokens,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt }
        ]
      })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`LLM request failed: ${resp.status} ${resp.statusText} ${text}`);
    }

    const json: any = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Unexpected LLM response shape");
    return { text: content, raw: json };
  }
}
```

- [ ] **Step 3: Commit**

Run:
```bash
git add src/provider
git commit -m "feat: add provider abstraction and volcengine provider"
```

---

### Task 4: `init` command (project scaffolding + defaults)

**Files:**
- Create: `src/templates/defaultConfig.ts`, `src/templates/defaultPrompts.ts`, `src/commands/init.ts`
- Modify: `src/cli.ts`
- Test: `tests/init.e2e.test.ts`

- [ ] **Step 1: Add default templates**

Create `src/templates/defaultConfig.ts`:
```ts
export const defaultConfigJson = (model = "YOUR_MODEL_NAME") =>
  JSON.stringify(
    {
      paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
      provider: { type: "volcengine", model, temperature: 0.2, maxTokens: 2000 },
      compile: { concurrency: 2 },
      query: { topK: 8 }
    },
    null,
    2
  );
```

Create `src/templates/defaultPrompts.ts`:
```ts
export const compileSystemPrompt = `你是知识库管理员。你要把 raw 层资料编译到 wiki 层。要求：Raw 不可修改；矛盾必须显式标注；输出可长期维护。`;

export const compileUserPrompt = (rawPath: string, rawContent: string) => `请将以下原始资料编译成一页 wiki markdown。\n\n来源路径：${rawPath}\n\n原始内容：\n${rawContent}\n\n输出要求：\n1) 用 Markdown\n2) 包含 TL;DR、要点、引用证据片段\n3) 如发现与已知常识或可能存在分歧，用“冲突”块标注。`;

export const querySystemPrompt = `你是知识库问答助手。你只能基于提供的 wiki 内容回答；不确定要明确写出，并给出你依据的引用片段。`;
export const queryUserPrompt = (question: string, context: string) =>
  `问题：${question}\n\n可用知识（wiki 摘要）：\n${context}\n\n请输出：\n- 结论\n- 要点\n- 引用（来自 wiki 的原文片段）\n- 不确定性/需要更多信息`;
```

- [ ] **Step 2: Implement init command**

Create `src/commands/init.ts`:
```ts
import path from "node:path";
import { getProjectPaths } from "../core/paths.js";
import { ensureDir, fileExists, writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { defaultConfigJson } from "../templates/defaultConfig.js";

export async function initCommand(opts: { root?: string; model?: string }) {
  const paths = getProjectPaths(opts.root);
  await ensureDir(paths.rawDir);
  await ensureDir(paths.wikiDir);
  await ensureDir(paths.outputsDir);
  await ensureDir(paths.promptsDir);
  await ensureDir(path.dirname(paths.configFile));
  await ensureDir(paths.stateDir);

  if (!(await fileExists(paths.configFile))) {
    await writeFileAtomic(paths.configFile, defaultConfigJson(opts.model));
  }

  if (!(await fileExists(paths.logFile))) {
    await writeFileAtomic(paths.logFile, "# LLM Wiki Log\n\n");
  }

  await appendLog(paths.logFile, "init", [
    `root: ${paths.root}`,
    "created: raw/, wiki/, outputs/, prompts/, config/, .llm-wiki/",
    `config: ${path.relative(paths.root, paths.configFile)}`
  ]);
}
```

- [ ] **Step 3: Wire init into CLI**

Modify `src/cli.ts`:
```ts
import { Command } from "commander";
import { initCommand } from "./commands/init.js";

const program = new Command();

program.name("llm-wiki").description("LLM Wiki CLI (raw → wiki compiler)").version("0.0.1");

program
  .command("init")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--model <name>", "LLM model name")
  .action(async (opts) => {
    await initCommand({ root: opts.root, model: opts.model });
  });

program.parse();
```

- [ ] **Step 4: Add simple e2e test for init**

Create `tests/init.e2e.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { initCommand } from "../src/commands/init.js";

describe("initCommand", () => {
  it("creates folders and log", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-init-"));
    await initCommand({ root, model: "m" });
    const log = await fs.readFile(path.join(root, "wiki", "log.md"), "utf-8");
    expect(log).toContain("init");
    await fs.access(path.join(root, "raw"));
    await fs.access(path.join(root, "outputs"));
  });
});
```

- [ ] **Step 5: Run tests**

Run:
```bash
npm test
```
Expected: PASS.

- [ ] **Step 6: Commit**

Run:
```bash
git add src/templates src/commands/init.ts src/cli.ts tests/init.e2e.test.ts
git commit -m "feat: add init command and templates"
```

---

### Task 5: Compile pipeline (scan raw, incremental, write wiki + index + log)

**Files:**
- Create: `src/pipelines/compilePipeline.ts`, `src/commands/compile.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement compile pipeline skeleton**

Create `src/pipelines/compilePipeline.ts`:
```ts
import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { getProjectPaths } from "../core/paths.js";
import { sha256File } from "../core/hash.js";
import { loadConfig } from "../core/config.js";
import { loadIndex, saveIndex } from "../core/state.js";
import { writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { VolcengineProvider } from "../provider/volcengine.js";
import { compileSystemPrompt, compileUserPrompt } from "../templates/defaultPrompts.js";

function wikiPathForRaw(root: string, rawAbs: string): string {
  const rel = path.relative(path.join(root, "raw"), rawAbs);
  return path.join(root, "wiki", "sources", `${rel}.md`);
}

export async function compilePipeline(opts: { root?: string; full?: boolean }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);
  const cfg = await loadConfig(root);
  const index = await loadIndex(paths.indexFile);

  const rawFiles = await globby(["**/*.md", "**/*.txt"], { cwd: paths.rawDir, absolute: true });

  const provider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens
  });

  const updated: string[] = [];
  const errors: string[] = [];

  for (const f of rawFiles) {
    const relKey = path.relative(root, f).replace(/\\/g, "/");
    const sha = await sha256File(f);
    const prev = index.raw[relKey];
    const needs = opts.full || !prev || prev.sha256 !== sha;
    if (!needs) continue;

    try {
      const rawText = await fs.readFile(f, "utf-8");
      const out = await provider.generateText({
        system: compileSystemPrompt,
        prompt: compileUserPrompt(relKey, rawText)
      });

      const wikiAbs = wikiPathForRaw(root, f);
      const header = [
        "---",
        `source: ${relKey}`,
        `raw_sha256: ${sha}`,
        `compiled_at: ${new Date().toISOString()}`,
        "---",
        ""
      ].join("\n");
      await writeFileAtomic(wikiAbs, header + out.text.trim() + "\n");
      updated.push(path.relative(root, wikiAbs).replace(/\\/g, "/"));

      index.raw[relKey] = { sha256: sha, lastCompiledAt: new Date().toISOString(), status: "ok" };
    } catch (e: any) {
      const msg = e?.stack || e?.message || String(e);
      errors.push(`${relKey}: ${msg}`);
      index.raw[relKey] = { sha256: sha, lastCompiledAt: new Date().toISOString(), status: "error", error: msg };
    }
  }

  await saveIndex(paths.indexFile, index);

  await appendLog(paths.logFile, "compile", [
    `rawTotal: ${rawFiles.length}`,
    `wikiUpdated: ${updated.length}`,
    ...(updated.length ? updated.map((p) => `wiki: ${p}`) : []),
    ...(errors.length ? ["status: error", ...errors.map((x) => `error: ${x}`)] : ["status: ok"])
  ]);

  return { updated, errors };
}
```

- [ ] **Step 2: Add compile command wrapper**

Create `src/commands/compile.ts`:
```ts
import { compilePipeline } from "../pipelines/compilePipeline.js";

export async function compileCommand(opts: { root?: string; full?: boolean }) {
  const res = await compilePipeline(opts);
  if (res.errors.length) {
    process.exitCode = 1;
  }
}
```

- [ ] **Step 3: Wire into CLI**

Modify `src/cli.ts` to add:
```ts
import { compileCommand } from "./commands/compile.js";

program
  .command("compile")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--full", "Full recompile")
  .action(async (opts) => {
    await compileCommand({ root: opts.root, full: !!opts.full });
  });
```

- [ ] **Step 4: Manual smoke test**

Run:
```bash
npm run dev -- init --model YOUR_MODEL_NAME
echo "# test\nhello" > raw/a.md
npm run dev -- compile
ls wiki/sources
```

Expected: `wiki/sources/a.md.md` (note: in later step we may normalize extension to avoid `.md.md`).

- [ ] **Step 5: Fix wiki filename extension (normalize)**

Update `wikiPathForRaw` to strip original extension:
```ts
const rel = path.relative(path.join(root, "raw"), rawAbs);
const noExt = rel.replace(/\.(md|txt)$/i, "");
return path.join(root, "wiki", "sources", `${noExt}.md`);
```

- [ ] **Step 6: Commit**

Run:
```bash
git add src/pipelines src/commands/compile.ts src/cli.ts
git commit -m "feat: add incremental compile pipeline"
```

---

### Task 6: Query pipeline (search wiki, answer, persist to outputs, log)

**Files:**
- Create: `src/pipelines/queryPipeline.ts`, `src/commands/query.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement naive wiki search + context build**

Create `src/pipelines/queryPipeline.ts`:
```ts
import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { getProjectPaths } from "../core/paths.js";
import { loadConfig } from "../core/config.js";
import { writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { VolcengineProvider } from "../provider/volcengine.js";
import { querySystemPrompt, queryUserPrompt } from "../templates/defaultPrompts.js";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "query";
}

export async function queryPipeline(opts: { root?: string; question: string }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);
  const cfg = await loadConfig(root);

  const wikiFiles = await globby(["**/*.md"], { cwd: paths.wikiDir, absolute: true });

  // MVP: keyword count scoring
  const qTokens = opts.question.split(/\s+/).filter(Boolean);
  const scored: Array<{ file: string; score: number; excerpt: string }> = [];

  for (const f of wikiFiles) {
    const text = await fs.readFile(f, "utf-8");
    const lower = text.toLowerCase();
    let score = 0;
    for (const t of qTokens) score += lower.includes(t.toLowerCase()) ? 1 : 0;
    if (score > 0) {
      scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cfg.query.topK);
  const context = top
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
  const outRel = path.join("outputs", `${stamp}-${slug}.md`);
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
    `output: ${outRel.replace(/\\/g, "/")}`,
    "status: ok"
  ]);

  return { outputFile: outAbs, outputRel: outRel };
}
```

- [ ] **Step 2: Add query command**

Create `src/commands/query.ts`:
```ts
import { queryPipeline } from "../pipelines/queryPipeline.js";

export async function queryCommand(opts: { root?: string; question: string }) {
  await queryPipeline(opts);
}
```

- [ ] **Step 3: Wire into CLI**

Modify `src/cli.ts`:
```ts
import { queryCommand } from "./commands/query.js";

program
  .command("query")
  .argument("<question>", "Question to ask")
  .option("--root <path>", "Project root (default: cwd)")
  .action(async (question, opts) => {
    await queryCommand({ root: opts.root, question });
  });
```

- [ ] **Step 4: Manual smoke test**

Run:
```bash
npm run dev -- query "test"
ls outputs
tail -n 20 wiki/log.md
```
Expected: outputs has new file; log appended.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/pipelines/queryPipeline.ts src/commands/query.ts src/cli.ts
git commit -m "feat: add query pipeline with persisted outputs"
```

---

### Task 7: Status command

**Files:**
- Create: `src/commands/status.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement status**

Create `src/commands/status.ts`:
```ts
import fs from "node:fs/promises";
import { getProjectPaths } from "../core/paths.js";
import { loadIndex } from "../core/state.js";
import { fileExists } from "../core/fs.js";

export async function statusCommand(opts: { root?: string }) {
  const paths = getProjectPaths(opts.root);
  const index = await loadIndex(paths.indexFile);
  const entries = Object.values(index.raw);
  const ok = entries.filter((e) => e.status === "ok").length;
  const err = entries.filter((e) => e.status === "error").length;

  let lastLogLine = "";
  if (await fileExists(paths.logFile)) {
    const log = await fs.readFile(paths.logFile, "utf-8");
    lastLogLine = log.trim().split("\n").slice(-1)[0] ?? "";
  }

  console.log(
    JSON.stringify(
      {
        rawTracked: Object.keys(index.raw).length,
        compiledOk: ok,
        compiledError: err,
        lastLogLine
      },
      null,
      2
    )
  );
}
```

- [ ] **Step 2: Wire into CLI**

Modify `src/cli.ts`:
```ts
import { statusCommand } from "./commands/status.js";

program
  .command("status")
  .option("--root <path>", "Project root (default: cwd)")
  .action(async (opts) => {
    await statusCommand({ root: opts.root });
  });
```

- [ ] **Step 3: Commit**

Run:
```bash
git add src/commands/status.ts src/cli.ts
git commit -m "feat: add status command"
```

---

## Self-review checklist (run after writing code)

- Spec coverage:
  - Raw 不可变：compile/query 过程中从不写 `raw/` ✅（verify in code review)
  - Wiki 由工具生成：wiki 写入集中在 compile pipeline ✅
  - outputs 必落盘：query pipeline 总写 `outputs/` ✅
  - 冲突显式标注：当前由 LLM 在 wiki 内容内产出（模板在 prompts 中）✅（后续可强化结构检查）
  - 每次操作写 `wiki/log.md` ✅
- Placeholder scan:
  - Search code for `TODO|TBD|placeholder` and remove.
- Type consistency:
  - `ProjectPaths` / `AppConfig` / provider interfaces consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-13-llm-wiki-cli-implementation-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

