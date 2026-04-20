# Schema 对齐（CLI + Obsidian 插件）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于根目录 SCHEMA.md 做差异分析，并按“最小可用”补齐 CLI 与 Obsidian 插件（含 sources→summaries 自动迁移、index.md 维护、侧边栏面板与 5 个常用按钮配置、设置页模型测试按钮）。

**Architecture:** 新增一个可复用的 schema 模块（解析 + diff + 报告渲染），CLI 增加 schema 命令；compilePipeline 迁移输出路径并维护 index；Obsidian 插件新增 Ribbon+View 面板并复用 llm-wiki 包导出的能力。

**Tech Stack:** TypeScript (Node ESM), vitest, Obsidian plugin API.

---

## File Map（将被创建/修改的文件）

**CLI / Core（llm-wiki 包）**
- Create: `src/schema/schema.ts`
- Create: `src/schema/report.ts`
- Create: `src/commands/schema.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Modify: `src/core/paths.ts`
- Modify: `src/commands/init.ts`
- Modify: `src/pipelines/compilePipeline.ts`
- Create: `src/core/indexFile.ts`

**Tests**
- Create: `tests/schema.test.ts`
- Modify: `tests/init.e2e.test.ts`
- Create: `tests/compile-migrate-index.test.ts`

**Obsidian 插件**
- Create: `obsidian-plugin/src/views/LLMWikiPanelView.ts`
- Modify: `obsidian-plugin/src/main.ts`
- Modify: `obsidian-plugin/src/settings.ts`

---

### Task 1: 添加 Schema 解析 + Diff 核心模块（可测试、可复用）

**Files:**
- Create: `src/schema/schema.ts`
- Create: `src/schema/report.ts`
- Test: `tests/schema.test.ts`

- [ ] **Step 1: 写 failing test（Schema 解析与 diff）**

```ts
import { describe, it, expect } from "vitest";
import { diffSchemaAgainstProject, parseSchemaMarkdown } from "../src/schema/schema.js";

describe("schema diff", () => {
  it("extracts expected dirs and detects missing items", () => {
    const md = [
      "# SCHEMA.md",
      "",
      "```",
      "xcxnotes/",
      "├── wiki/",
      "│   ├── entities/",
      "│   ├── summaries/",
      "│   ├── concepts/",
      "│   ├── index.md",
      "│   └── log.md",
      "```",
      "",
      "### 1. 实体页面 (entities/)",
      "### 3. 源文件摘要 (summaries/)"
    ].join("\\n");

    const schema = parseSchemaMarkdown(md);
    expect(schema.expectedPaths).toContain("wiki/entities");
    expect(schema.expectedPaths).toContain("wiki/summaries");
    expect(schema.expectedFiles).toContain("wiki/index.md");
    expect(schema.expectedFiles).toContain("wiki/log.md");

    const diff = diffSchemaAgainstProject(schema);
    expect(diff.missing.some((x) => x.id === "wiki/index.md")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/schema.test.ts`  
Expected: FAIL（`../src/schema/schema.js` 不存在）

- [ ] **Step 3: 实现 schema.ts（解析 + diff 数据结构）**

```ts
export type SchemaParseResult = {
  expectedPaths: string[];
  expectedFiles: string[];
  raw: string;
};

export type CapabilityItem = {
  id: string;
  kind: "path" | "file" | "command";
  title: string;
};

export type SchemaDiff = {
  missing: CapabilityItem[];
  extra: CapabilityItem[];
  notes: string[];
};

function normalizePath(p: string) {
  return p.replace(/\\\\/g, "/").replace(/\/+$/g, "").replace(/^\.?\//, "");
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

export function parseSchemaMarkdown(md: string): SchemaParseResult {
  const expectedPaths: string[] = [];
  const expectedFiles: string[] = [];

  const codeBlocks = md.match(/```[\\s\\S]*?```/g) ?? [];
  for (const blk of codeBlocks) {
    const lines = blk
      .replace(/^```[a-zA-Z0-9-]*\\n?/, "")
      .replace(/```$/, "")
      .split("\\n");
    for (const line of lines) {
      const m = line.match(/(?:├──|└──)\\s*([^#]+?)(?:\\s+#.*)?$/);
      if (!m) continue;
      const raw = m[1].trim();
      if (!raw) continue;
      if (raw.endsWith("/")) expectedPaths.push(normalizePath(raw.slice(0, -1)));
      else expectedFiles.push(normalizePath(raw));
    }
  }

  const headingMatches = md.match(/\\([^\\n]*?\\/[\\)]/g) ?? [];
  for (const h of headingMatches) {
    const m = h.match(/\\(([^\\)]+\\/?)\\)/);
    if (!m) continue;
    const raw = m[1].trim();
    if (!raw) continue;
    const isDir = raw.endsWith("/");
    const normalized = normalizePath(isDir ? raw.slice(0, -1) : raw);
    if (isDir) expectedPaths.push(normalized);
  }

  for (const f of ["wiki/index.md", "wiki/log.md"]) {
    if (md.includes(f)) expectedFiles.push(f);
  }

  return {
    expectedPaths: uniq(expectedPaths),
    expectedFiles: uniq(expectedFiles),
    raw: md
  };
}

export function getProjectCapabilities(): CapabilityItem[] {
  return [
    { id: "raw", kind: "path", title: "raw 目录" },
    { id: "wiki", kind: "path", title: "wiki 目录" },
    { id: "wiki/summaries", kind: "path", title: "wiki/summaries 目录" },
    { id: "wiki/concepts", kind: "path", title: "wiki/concepts 目录" },
    { id: "wiki/authoritative", kind: "path", title: "wiki/authoritative 目录" },
    { id: "outputs", kind: "path", title: "outputs 目录" },
    { id: "prompts", kind: "path", title: "prompts 目录" },
    { id: "config", kind: "path", title: "config 目录" },
    { id: ".llm-wiki", kind: "path", title: ".llm-wiki 目录" },
    { id: "wiki/log.md", kind: "file", title: "wiki/log.md 日志" },
    { id: "wiki/index.md", kind: "file", title: "wiki/index.md 索引" },
    { id: "init", kind: "command", title: "CLI init" },
    { id: "compile", kind: "command", title: "CLI compile" },
    { id: "query", kind: "command", title: "CLI query" },
    { id: "status", kind: "command", title: "CLI status" },
    { id: "schema", kind: "command", title: "CLI schema" }
  ];
}

export function diffSchemaAgainstProject(schema: SchemaParseResult): SchemaDiff {
  const caps = getProjectCapabilities();
  const capIndex = new Map(caps.map((c) => [c.id, c]));

  const expectedItems: CapabilityItem[] = [
    ...schema.expectedPaths.map((p) => ({
      id: p,
      kind: "path" as const,
      title: p
    })),
    ...schema.expectedFiles.map((f) => ({
      id: f,
      kind: "file" as const,
      title: f
    }))
  ];

  const missing = expectedItems.filter((e) => !capIndex.has(e.id));
  const expectedIndex = new Set(expectedItems.map((x) => x.id));
  const extra = caps.filter((c) => (c.kind === "path" || c.kind === "file") && !expectedIndex.has(c.id));

  const notes: string[] = ["sources→summaries: compile 时自动迁移 wiki/sources 到 wiki/summaries（若 summaries 不存在）"];
  return { missing, extra, notes };
}
```

- [ ] **Step 4: 实现 report.ts（输出 Markdown/JSON）**

```ts
import { SchemaDiff } from "./schema.js";

export function renderSchemaDiffMarkdown(diff: SchemaDiff) {
  const lines: string[] = [];
  lines.push("# Schema Diff");
  lines.push("");
  lines.push("## Missing");
  lines.push("");
  if (diff.missing.length === 0) lines.push("- (none)");
  else for (const m of diff.missing) lines.push(`- ${m.kind}: ${m.id}`);
  lines.push("");
  lines.push("## Extra");
  lines.push("");
  if (diff.extra.length === 0) lines.push("- (none)");
  else for (const x of diff.extra) lines.push(`- ${x.kind}: ${x.id}`);
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const n of diff.notes) lines.push(`- ${n}`);
  lines.push("");
  return lines.join("\\n");
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- tests/schema.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/schema/schema.ts src/schema/report.ts tests/schema.test.ts
git commit -m "feat: add schema parser and diff core"
```

---

### Task 2: CLI 增加 schema 命令并导出公共 API

**Files:**
- Create: `src/commands/schema.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 写 failing test（CLI 层不做端到端，做函数级）**

在本任务中不新增测试文件，依赖 Task 1 的模块测试覆盖；本任务用 `npm run build` 做验证。

- [ ] **Step 2: 新增命令实现（读取根目录 SCHEMA.md）**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { parseSchemaMarkdown, diffSchemaAgainstProject } from "../schema/schema.js";
import { renderSchemaDiffMarkdown } from "../schema/report.js";
import { fileExists } from "../core/fs.js";

export async function schemaCommand(opts: { root?: string; format?: "md" | "json" }) {
  const root = opts.root ?? process.cwd();
  const schemaPath = path.join(root, "SCHEMA.md");
  if (!(await fileExists(schemaPath))) {
    throw new Error("SCHEMA.md not found in project root");
  }
  const md = await fs.readFile(schemaPath, "utf-8");
  const schema = parseSchemaMarkdown(md);
  const diff = diffSchemaAgainstProject(schema);

  if (opts.format === "json") {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }
  console.log(renderSchemaDiffMarkdown(diff));
}
```

- [ ] **Step 3: 接入 CLI（src/cli.ts）**

```ts
import { schemaCommand } from "./commands/schema.js";

program
  .command("schema")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--format <format>", "Output format: md|json", "md")
  .action(async (opts) => {
    const format = opts.format === "json" ? "json" : "md";
    await schemaCommand({ root: opts.root, format });
  });
```

- [ ] **Step 4: 导出公共 API（src/index.ts）**

```ts
export { schemaCommand } from "./commands/schema.js";
export { parseSchemaMarkdown, diffSchemaAgainstProject } from "./schema/schema.js";
export { renderSchemaDiffMarkdown } from "./schema/report.js";
```

- [ ] **Step 5: Build 验证**

Run: `npm run build`  
Expected: tsc 通过，无类型错误

- [ ] **Step 6: Commit**

```bash
git add src/commands/schema.ts src/cli.ts src/index.ts
git commit -m "feat: add llm-wiki schema command"
```

---

### Task 3: init 对齐 Schema 目录（最小可用）

**Files:**
- Modify: `src/commands/init.ts`
- Modify: `tests/init.e2e.test.ts`

- [ ] **Step 1: 更新 e2e test（要求创建规范目录）**

```ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { initCommand } from "../src/commands/init.js";

describe("initCommand", () => {
  it("creates folders and log", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-init-"));
    await fs.writeFile(path.join(root, "SCHEMA.md"), [
      "```",
      "xcxnotes/",
      "├── wiki/",
      "│   ├── entities/",
      "│   ├── comparisons/",
      "│   ├── synthesis/",
      "│   └── summaries/",
      "```"
    ].join("\\n"));

    await initCommand({ root, model: "m" });
    const log = await fs.readFile(path.join(root, "wiki", "log.md"), "utf-8");
    expect(log).toContain("init");
    await fs.access(path.join(root, "raw"));
    await fs.access(path.join(root, "outputs"));
    await fs.access(path.join(root, "wiki", "entities"));
    await fs.access(path.join(root, "wiki", "comparisons"));
    await fs.access(path.join(root, "wiki", "synthesis"));
    await fs.access(path.join(root, "wiki", "summaries"));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/init.e2e.test.ts`  
Expected: FAIL（init 尚未创建 entities/comparisons/synthesis/summaries）

- [ ] **Step 3: 修改 initCommand：检测 SCHEMA.md 并创建目录**

实现要点：
- 复用 Task 1 的 `parseSchemaMarkdown`
- 仅创建相对路径在项目 root 下的目录项；忽略包含 `..` 的路径

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { parseSchemaMarkdown } from "../schema/schema.js";
import { fileExists } from "../core/fs.js";

async function createSchemaDirsIfAny(root: string) {
  const schemaPath = path.join(root, "SCHEMA.md");
  if (!(await fileExists(schemaPath))) return;
  const md = await fs.readFile(schemaPath, "utf-8");
  const parsed = parseSchemaMarkdown(md);

  for (const p of parsed.expectedPaths) {
    const clean = p.replace(/\\\\/g, "/");
    if (!clean || clean.includes("..")) continue;
    await ensureDir(path.join(root, clean));
  }
}
```

在 `initCommand` 中，在现有 ensureDir 之后调用：

```ts
await createSchemaDirsIfAny(paths.root);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/init.e2e.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.ts tests/init.e2e.test.ts
git commit -m "feat: init creates schema dirs when SCHEMA.md exists"
```

---

### Task 4: compile 对齐 summaries 输出 + sources→summaries 自动迁移 + index.md 维护

**Files:**
- Modify: `src/pipelines/compilePipeline.ts`
- Modify: `src/core/paths.ts`
- Create: `src/core/indexFile.ts`
- Test: `tests/compile-migrate-index.test.ts`

- [ ] **Step 1: 写 failing test（迁移 + index）**

```ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { compilePipeline } from "../src/pipelines/compilePipeline.js";
import { writeFileAtomic } from "../src/core/fs.js";

function mockFetch(okText: string) {
  return async () =>
    ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: `<wiki># T\\ncontent</wiki>\\n<concepts>[]</concepts>` } }]
      }),
      text: async () => okText
    }) as any;
}

describe("compilePipeline migration + index", () => {
  it("migrates wiki/sources to wiki/summaries and writes wiki/index.md", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-compile-"));

    await fs.mkdir(path.join(root, "raw"), { recursive: true });
    await fs.mkdir(path.join(root, "wiki", "sources"), { recursive: true });
    await writeFileAtomic(path.join(root, "wiki", "sources", "a.md"), "old");

    await fs.mkdir(path.join(root, "config"), { recursive: true });
    await writeFileAtomic(
      path.join(root, "config", "llm-wiki.config.json"),
      JSON.stringify(
        {
          paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs" },
          provider: { type: "volcengine", model: "m", baseUrl: "https://example.com", apiKey: "k" },
          embedding: { enabled: false, type: "volcengine", model: "e" }
        },
        null,
        2
      )
    );

    await writeFileAtomic(path.join(root, "raw", "a.md"), "hi");

    await compilePipeline({ root, fetcher: mockFetch("ok") as any });

    await fs.access(path.join(root, "wiki", "summaries", "a.md"));
    const index = await fs.readFile(path.join(root, "wiki", "index.md"), "utf-8");
    expect(index).toContain("wiki/summaries/a");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/compile-migrate-index.test.ts`  
Expected: FAIL（compile 仍写 sources，且不生成 index.md）

- [ ] **Step 3: 修改 compilePipeline 的 summaries 输出路径**

将 `wikiPathForRaw` 中 `wiki/sources` 改为 `wiki/summaries`（并同步 authoritative 相关 regex 若依赖 sources 路径）。

预期修改位置：`src/pipelines/compilePipeline.ts` 的 `wikiPathForRaw()`。

- [ ] **Step 4: 增加自动迁移函数（sources→summaries）**

在 compilePipeline 开头（读取 cfg 后，处理 rawFiles 前）：
- 若 `wiki/summaries` 不存在且 `wiki/sources` 存在：递归移动整个目录树到 summaries
- 若 summaries 已存在：不做任何事

实现建议（不引入依赖）：
- 新增一个 `moveDirRecursive(from, to)`，用 `fs.readdir({ withFileTypes: true })` + `fs.rename`，rename 失败再 copy+unlink

- [ ] **Step 5: 新增 index.md 维护模块（幂等更新）**

Create `src/core/indexFile.ts`：

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, writeFileAtomic } from "./fs.js";

function toLink(p: string) {
  return `[[${p.replace(/\\.md$/, "")}]]`;
}

export async function updateWikiIndex(opts: { root: string; wikiDir: string; summaries: string[]; concepts: string[]; authoritative: string[]; outputs: string[] }) {
  const indexAbs = path.join(opts.root, opts.wikiDir, "index.md");
  const sections = [
    { title: "Summaries", items: opts.summaries },
    { title: "Concepts", items: opts.concepts },
    { title: "Authoritative", items: opts.authoritative },
    { title: "Outputs", items: opts.outputs }
  ];

  const header = "# Wiki Index\\n\\n";
  let existing = (await fileExists(indexAbs)) ? await fs.readFile(indexAbs, "utf-8") : header;

  const normalized = new Map<string, Set<string>>();
  for (const sec of sections) normalized.set(sec.title, new Set(sec.items.map((x) => x.replace(/\\\\/g, "/"))));

  const out: string[] = [header.trimEnd(), ""];
  for (const sec of sections) {
    out.push(`## ${sec.title}`);
    out.push("");
    const uniq = Array.from(normalized.get(sec.title) ?? []).sort();
    if (uniq.length === 0) out.push("- (none)");
    else for (const item of uniq) out.push(`- ${toLink(item)}`);
    out.push("");
  }

  const next = out.join("\\n");
  if (existing.trim() === next.trim()) return;
  await writeFileAtomic(indexAbs, next);
}
```

在 compilePipeline 末尾（appendLog 前后均可，但推荐在 saveIndex 后、appendLog 前）调用 `updateWikiIndex`：
- summaries：本次 compile 更新过的 wikiRel（只汇总 summaries 下的即可）
- concepts：`wiki/concepts/*.md` 的相对路径（可用 globby 取一次）
- authoritative：`wiki/authoritative/*.md`（可选）
- outputs：`outputs/*.md`（可选）

最小实现允许只写 summaries + concepts，其余传空数组。

- [ ] **Step 6: 更新 src/core/paths.ts 中 logFile 与 wikiDir 关系（确保兼容）**

当前 logFile 固定为 `path.join(root, "wiki", "log.md")`。若 config.paths.wikiDir 改为别的值会不一致。按本次对齐，建议改为：

```ts
logFile: path.join(wikiDir, "log.md")
```

并保持 wikiDir 仍可从 config.paths.wikiDir 覆盖。

- [ ] **Step 7: 运行测试确认通过**

Run: `npm test -- tests/compile-migrate-index.test.ts`  
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/pipelines/compilePipeline.ts src/core/indexFile.ts src/core/paths.ts tests/compile-migrate-index.test.ts
git commit -m "feat: compile writes summaries, auto-migrates sources, updates wiki index"
```

---

### Task 5: Obsidian 插件：Ribbon 打开侧边栏面板（含 5 个常用按钮 + Schema diff 展示）

**Files:**
- Create: `obsidian-plugin/src/views/LLMWikiPanelView.ts`
- Modify: `obsidian-plugin/src/main.ts`

- [ ] **Step 1: 新增 View（只做最小 UI）**

Create `obsidian-plugin/src/views/LLMWikiPanelView.ts`：

```ts
import { ItemView, WorkspaceLeaf } from "obsidian";
import type LLMWikiPlugin from "../main";

export const LLMWIKI_PANEL_VIEW_TYPE = "llm-wiki-panel-view";

export class LLMWikiPanelView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: LLMWikiPlugin) {
    super(leaf);
  }

  getViewType() {
    return LLMWIKI_PANEL_VIEW_TYPE;
  }

  getDisplayText() {
    return "LLM Wiki";
  }

  async onOpen() {
    this.render();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createEl("h2", { text: "LLM Wiki" });
    header.style.marginTop = "0";

    const btnWrap = contentEl.createDiv();
    for (const id of this.plugin.getQuickActions()) {
      const btn = btnWrap.createEl("button", { text: this.plugin.getActionLabel(id) });
      btn.style.display = "block";
      btn.style.width = "100%";
      btn.style.marginBottom = "8px";
      btn.onclick = () => this.plugin.runAction(id);
    }

    contentEl.createEl("h3", { text: "Schema Diff" });
    const pre = contentEl.createEl("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.setText(this.plugin.schemaDiffText ?? "Not loaded");

    const refresh = contentEl.createEl("button", { text: "Re-analyze" });
    refresh.style.marginTop = "8px";
    refresh.style.width = "100%";
    refresh.onclick = async () => {
      await this.plugin.refreshSchemaDiff();
      this.render();
    };
  }
}
```

- [ ] **Step 2: main.ts 注册 view + Ribbon 图标 + 打开逻辑**

在 `obsidian-plugin/src/main.ts`：
- `registerView(LLMWIKI_PANEL_VIEW_TYPE, ...)`
- `addRibbonIcon(...)` 点击时打开右侧叶子并 setViewState
- 在 plugin 类新增：
  - `schemaDiffText?: string`
  - `refreshSchemaDiff(): Promise<void>`
  - `getQuickActions(): string[]`
  - `getActionLabel(id: string): string`
  - `runAction(id: string): void`

其中 `refreshSchemaDiff()` 调用 llm-wiki 包导出的 schema diff API（Task 2）。

- [ ] **Step 3: build 验证**

Run（在 `obsidian-plugin/` 目录）：`npm run build`  
Expected: esbuild 通过

- [ ] **Step 4: Commit**

```bash
git add obsidian-plugin/src/views/LLMWikiPanelView.ts obsidian-plugin/src/main.ts
git commit -m "feat(obsidian): add ribbon panel view with quick actions and schema diff"
```

---

### Task 6: Obsidian 插件：settings 增加“常用 5 个按钮”配置 + 配置测试按钮（文本/embedding 分开）

**Files:**
- Modify: `obsidian-plugin/src/settings.ts`
- Modify: `obsidian-plugin/src/main.ts`

- [ ] **Step 1: 扩展 settings 结构与默认值**

在 `LLMWikiSettings` 增加字段：
- `quickActions: string[]`（长度固定 5）

DEFAULT_SETTINGS：
- `quickActions: ["init", "compile", "query", "followup", "status"]`

- [ ] **Step 2: settings UI：渲染 5 个 dropdown**

每个 dropdown 的选项集合：
- init / compile / query / followup / authoritative / status / schema

保存后：
- `await this.plugin.saveSettings();`
- `this.plugin.onSettingsChanged?.()`（或直接 `this.display()` + 通知 panel 重新渲染）

- [ ] **Step 3: settings UI：增加 2 个测试按钮**

在 settings 页增加：
- “Test Text Model”
- “Test Embedding Model”

按钮点击调用 plugin 的 `testTextModel()` / `testEmbeddingModel()`，成功/失败用 Notice。

`testTextModel()` 与 `testEmbeddingModel()` 推荐复用 llm-wiki 包新增的测试函数（建议在实现时加到 `src/provider/test.ts` 并从 `src/index.ts` 导出），并传入 Obsidian 的 `obsidianFetch`。

- [ ] **Step 4: Build 验证**

Run（在 `obsidian-plugin/` 目录）：`npm run build`  
Expected: esbuild 通过

- [ ] **Step 5: Commit**

```bash
git add obsidian-plugin/src/settings.ts obsidian-plugin/src/main.ts
git commit -m "feat(obsidian): add configurable quick actions and provider test buttons"
```

---

### Task 7: 全量验证（CLI tests + build）

**Files:**
- Test: 全部

- [ ] **Step 1: 运行 llm-wiki 单测**

Run: `npm test`  
Expected: PASS

- [ ] **Step 2: 运行 llm-wiki 构建**

Run: `npm run build`  
Expected: PASS

- [ ] **Step 3: 运行 obsidian-plugin 构建**

Run（在 `obsidian-plugin/`）：`npm run build`  
Expected: PASS

---

## Plan Self-Review

- Spec coverage:
  - schema diff（Task 1-2）
  - init 创建 schema 目录（Task 3）
  - compile summaries + 自动迁移 + index（Task 4）
  - Ribbon 面板 + 5 个可配置按钮（Task 5-6）
  - settings 测试按钮（Task 6）
- Placeholder scan: 已避免 TODO/TBD；每个 task 给出具体文件与代码片段、测试与命令。
- Type consistency: quick action id 统一使用 `init|compile|query|followup|authoritative|status|schema`。

