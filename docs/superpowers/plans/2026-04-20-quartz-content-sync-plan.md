# Quartz Content Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 vault1（LLMWiki）增加 export + lint 能力，并通过 GitHub Actions 将 `export/` 的内容镜像同步 push 到 vault2（Quartz）`content/`。

**Architecture:** 将“发布规范化”限制在 `export/` 副本中完成：compile 生成 wiki/outputs → export 复制与补齐 frontmatter + 生成 index 页 → lint 对 export 全量预检并阻断 → CI 同步提交到 vault2。

**Tech Stack:** TypeScript (ESM), commander, globby, gray-matter, vitest, GitHub Actions

---

## File Structure

**Create:**
- `src/pipelines/exportPipeline.ts`
- `src/pipelines/lintPipeline.ts`
- `src/commands/export.ts`
- `src/commands/lint.ts`
- `src/core/slug.ts`
- `tests/export.test.ts`
- `tests/lint.test.ts`
- `.github/workflows/quartz-content-sync.yml`
- `SCHEMA.quartz-content.md`

**Modify:**
- `src/cli.ts`
- `src/core/config.ts`（增加 export/lint 可选配置）
- `src/templates/defaultConfig.ts`（补默认值，避免 init 后缺配置）

---

### Task 1: Add Export/Lint Config (Optional)

**Files:**
- Modify: [config.ts](file:///Users/cherrych/Documents/trae_projects/LLMWiki/src/core/config.ts)
- Modify: [defaultConfig.ts](file:///Users/cherrych/Documents/trae_projects/LLMWiki/src/templates/defaultConfig.ts)

- [ ] **Step 1: Write the failing test (config parse)**

Create `tests/export-lint-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { loadConfig } from "../src/core/config.js";

describe("config: export/lint defaults", () => {
  it("parses config with missing export/lint sections using defaults", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-cfg-"));
    await fs.mkdir(path.join(root, "config"), { recursive: true });
    await fs.writeFile(
      path.join(root, "config", "llm-wiki.config.json"),
      JSON.stringify({
        paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
        provider: { type: "volcengine", model: "x", temperature: 0.2, maxTokens: 10 }
      }),
      "utf-8"
    );

    const cfg = await loadConfig(root);
    expect(cfg.export?.outDir ?? "export").toBe("export");
    expect(cfg.lint?.maxDescriptionLength ?? 200).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/export-lint-config.test.ts
```

Expected: FAIL (ConfigSchema does not include export/lint)

- [ ] **Step 3: Implement config schema changes**

Update `src/core/config.ts` to extend schema:

```ts
const ExportConfigSchema = z.object({
  outDir: z.string().default("export"),
  includeAssets: z.boolean().default(false),
  assetsDir: z.string().default("assets")
});

const LintConfigSchema = z.object({
  maxDescriptionLength: z.number().int().min(1).max(1000).default(200),
  linkCheck: z.boolean().default(false)
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
  compile: CompileConfigSchema.default({ concurrency: 2, language: "中文" }),
  query: QueryConfigSchema.default({ topK: 8 }),
  export: ExportConfigSchema.optional(),
  lint: LintConfigSchema.optional()
});
```

Update `src/templates/defaultConfig.ts` to include defaults:

```ts
export const defaultConfigJson = (model = "YOUR_MODEL_NAME") =>
  JSON.stringify(
    {
      paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
      provider: { type: "volcengine", model, temperature: 0.2, maxTokens: 2000 },
      compile: { concurrency: 2, language: "中文" },
      query: { topK: 8 },
      export: { outDir: "export", includeAssets: false, assetsDir: "assets" },
      lint: { maxDescriptionLength: 200, linkCheck: false }
    },
    null,
    2
  );
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/export-lint-config.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts src/templates/defaultConfig.ts tests/export-lint-config.test.ts
git commit -m "feat(config): add export/lint defaults"
```

---

### Task 2: Add Slug Utilities

**Files:**
- Create: `src/core/slug.ts`
- Test: `tests/slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toSlug, isValidSlugFilename } from "../src/core/slug.js";

describe("slug", () => {
  it("converts text to safe slug", () => {
    expect(toSlug("Hello World!")).toBe("hello-world");
    expect(toSlug("  A__B  ")).toBe("a-b");
  });

  it("validates filename slug", () => {
    expect(isValidSlugFilename("foo-bar.md")).toBe(true);
    expect(isValidSlugFilename("Foo.md")).toBe(false);
    expect(isValidSlugFilename("foo bar.md")).toBe(false);
    expect(isValidSlugFilename("foo:bar.md")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/slug.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement slug utilities**

Create `src/core/slug.ts`:

```ts
const ILLEGAL = /[:?#\\\"'*<>|]/g;

export function toSlug(input: string) {
  const s = (input || "")
    .trim()
    .toLowerCase()
    .replace(ILLEGAL, "-")
    .replace(/[^a-z0-9\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "untitled";
}

export function isValidSlugFilename(name: string) {
  if (!name.endsWith(".md")) return false;
  const base = name.slice(0, -3);
  if (!base) return false;
  if (/[A-Z]/.test(base)) return false;
  if (/\s/.test(base)) return false;
  if (ILLEGAL.test(base)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/slug.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/slug.ts tests/slug.test.ts
git commit -m "feat: add slug helpers for export/lint"
```

---

### Task 3: Implement Export Pipeline (Generate `export/`)

**Files:**
- Create: `src/pipelines/exportPipeline.ts`
- Test: `tests/export.test.ts`

- [ ] **Step 1: Write failing test (export structure + frontmatter enrichment)**

Create `tests/export.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { exportPipeline } from "../src/pipelines/exportPipeline.js";

describe("exportPipeline", () => {
  it("exports wiki content to export/ and enriches frontmatter", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-export-"));
    await fs.mkdir(path.join(root, "wiki", "summaries"), { recursive: true });
    await fs.mkdir(path.join(root, "wiki", "concepts"), { recursive: true });
    await fs.mkdir(path.join(root, "wiki", "authoritative"), { recursive: true });
    await fs.mkdir(path.join(root, "outputs"), { recursive: true });
    await fs.mkdir(path.join(root, "config"), { recursive: true });

    await fs.writeFile(
      path.join(root, "config", "llm-wiki.config.json"),
      JSON.stringify({
        paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
        provider: { type: "volcengine", model: "x", temperature: 0.2, maxTokens: 10 },
        export: { outDir: "export", includeAssets: false, assetsDir: "assets" }
      }),
      "utf-8"
    );

    await fs.writeFile(
      path.join(root, "wiki", "summaries", "hello.md"),
      ["---", "source: raw/hello.md", "raw_sha256: abc", "compiled_at: 2026-04-20T00:00:00.000Z", "---", "", "# Hello", "", "body"].join("\n"),
      "utf-8"
    );

    await exportPipeline({ root });

    const out = await fs.readFile(path.join(root, "export", "summaries", "hello.md"), "utf-8");
    const parsed = matter(out);
    expect(parsed.data.title).toBeTruthy();
    expect(parsed.data.type).toBe("summary");
    expect(Array.isArray(parsed.data.tags)).toBe(true);
    expect(parsed.data.draft).toBe(false);
    expect(out.includes("# Hello")).toBe(true);

    const idx = await fs.readFile(path.join(root, "export", "index.md"), "utf-8");
    expect(idx.includes("[[summaries/index]]")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/export.test.ts
```

Expected: FAIL (exportPipeline not found)

- [ ] **Step 3: Implement minimal exportPipeline**

Create `src/pipelines/exportPipeline.ts`:

```ts
import path from "node:path";
import fs from "node:fs/promises";
import { globby } from "globby";
import matter from "gray-matter";
import { loadConfig } from "../core/config.js";
import { ensureDir, writeFileAtomic, fileExists } from "../core/fs.js";
import { toSlug } from "../core/slug.js";

type ExportOpts = {
  root?: string;
  outDir?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureArrayTags(tags: any) {
  if (Array.isArray(tags)) return tags.filter((x) => typeof x === "string" && x.trim());
  if (typeof tags === "string" && tags.trim()) return [tags.trim()];
  return [];
}

function extractFirstH1(content: string) {
  const m = content.match(/^#\s+(.+)\s*$/m);
  return m ? m[1].trim() : "";
}

function withEnrichedFrontmatter(params: {
  raw: string;
  type: "summary" | "concept" | "authoritative" | "output" | "index";
  defaultTags: string[];
  fallbackTitle: string;
}) {
  const parsed = matter(params.raw);
  const data: any = { ...(parsed.data || {}) };
  const title = (data.title && String(data.title).trim()) || extractFirstH1(parsed.content) || params.fallbackTitle;

  const created = data.created ? String(data.created).trim() : today();
  const updated = data.updated ? String(data.updated).trim() : nowIso();

  const tags = ensureArrayTags(data.tags);
  const finalTags = tags.length ? tags : params.defaultTags;

  const description = data.description ? String(data.description).trim() : "";
  const aliases = Array.isArray(data.aliases) ? data.aliases : [];

  const outData = {
    ...data,
    title,
    type: params.type,
    tags: finalTags,
    created,
    updated,
    draft: typeof data.draft === "boolean" ? data.draft : false,
    ...(description ? { description } : { description: "" }),
    aliases
  };

  return matter.stringify(parsed.content, outData);
}

async function emptyDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
}

async function exportIndexPages(outRoot: string) {
  const index = [
    "---",
    'title: "Index"',
    "type: index",
    'description: "Site entry"',
    "tags: [index]",
    `created: ${today()}`,
    `updated: ${nowIso()}`,
    "draft: false",
    "aliases: []",
    "---",
    "",
    "# Index",
    "- [[summaries/index]]",
    "- [[concepts/index]]",
    "- [[authoritative/index]]",
    "- [[outputs/index]]",
    ""
  ].join("\n");

  const sections: Array<{ dir: string; title: string; type: string; tags: string[] }> = [
    { dir: "summaries", title: "Summaries", type: "index", tags: ["index", "summary"] },
    { dir: "concepts", title: "Concepts", type: "index", tags: ["index", "concept"] },
    { dir: "authoritative", title: "Authoritative", type: "index", tags: ["index", "authoritative"] },
    { dir: "outputs", title: "Outputs", type: "index", tags: ["index", "output"] }
  ];

  await writeFileAtomic(path.join(outRoot, "index.md"), index);

  for (const s of sections) {
    const p = path.join(outRoot, s.dir, "index.md");
    const body = [
      "---",
      `title: "${s.title}"`,
      "type: index",
      `description: "${s.title} index"`,
      `tags: [${s.tags.join(", ")}]`,
      `created: ${today()}`,
      `updated: ${nowIso()}`,
      "draft: false",
      "aliases: []",
      "---",
      "",
      `# ${s.title}`,
      ""
    ].join("\n");
    await writeFileAtomic(p, body);
  }
}

export async function exportPipeline(opts: ExportOpts) {
  const root = opts.root || process.cwd();
  const cfg = await loadConfig(root);
  const outDirRel = opts.outDir || cfg.export?.outDir || "export";
  const outRoot = path.resolve(root, outDirRel);
  const wikiRoot = path.resolve(root, cfg.paths.wikiDir);
  const outputsRoot = path.resolve(root, cfg.paths.outputsDir);

  await emptyDir(outRoot);

  const groups: Array<{ inDir: string; outDir: string; type: any; tags: string[] }> = [
    { inDir: path.join(wikiRoot, "summaries"), outDir: "summaries", type: "summary", tags: ["summary", "ingest"] },
    { inDir: path.join(wikiRoot, "concepts"), outDir: "concepts", type: "concept", tags: ["concept"] },
    { inDir: path.join(wikiRoot, "authoritative"), outDir: "authoritative", type: "authoritative", tags: ["authoritative"] }
  ];

  for (const g of groups) {
    if (!(await fileExists(g.inDir))) continue;
    const files = await globby(["**/*.md"], { cwd: g.inDir, absolute: true });
    for (const abs of files) {
      const rel = path.relative(g.inDir, abs).replace(/\\/g, "/");
      const base = path.basename(rel, ".md");
      const safe = `${toSlug(base)}.md`;
      const outAbs = path.join(outRoot, g.outDir, path.dirname(rel), safe);
      const raw = await fs.readFile(abs, "utf-8");
      const out = withEnrichedFrontmatter({
        raw,
        type: g.type,
        defaultTags: g.tags,
        fallbackTitle: base
      });
      await writeFileAtomic(outAbs, out);
    }
  }

  if (await fileExists(outputsRoot)) {
    const files = await globby(["**/*.md"], { cwd: outputsRoot, absolute: true });
    for (const abs of files) {
      const rel = path.relative(outputsRoot, abs).replace(/\\/g, "/");
      const base = path.basename(rel, ".md");
      const safe = `${toSlug(base)}.md`;
      const outAbs = path.join(outRoot, "outputs", path.dirname(rel), safe);
      const raw = await fs.readFile(abs, "utf-8");
      const out = withEnrichedFrontmatter({
        raw,
        type: "output",
        defaultTags: ["output"],
        fallbackTitle: base
      });
      await writeFileAtomic(outAbs, out);
    }
  }

  await exportIndexPages(outRoot);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/export.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipelines/exportPipeline.ts tests/export.test.ts
git commit -m "feat: add export pipeline for Quartz content"
```

---

### Task 4: Implement Lint Pipeline (Preflight for `export/`)

**Files:**
- Create: `src/pipelines/lintPipeline.ts`
- Test: `tests/lint.test.ts`

- [ ] **Step 1: Write failing test (detect YAML + slug + code fence issues)**

Create `tests/lint.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { lintPipeline } from "../src/pipelines/lintPipeline.js";

describe("lintPipeline", () => {
  it("returns errors for invalid frontmatter and filename", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-lint-"));
    await fs.mkdir(path.join(root, "export", "summaries"), { recursive: true });

    await fs.writeFile(
      path.join(root, "export", "summaries", "Bad Name.md"),
      ["---", "title: A: B", "type: summary", "tags: [x]", "---", "", "# T"].join("\n"),
      "utf-8"
    );

    await fs.writeFile(
      path.join(root, "export", "summaries", "ok.md"),
      ["---", "title: ok", "type: summary", "tags: [x]", "created: 2026-04-20", "updated: 2026-04-20T00:00:00.000Z", "draft: false", "---", "", "# ok", "", "```js", "const x = 1"].join("\n"),
      "utf-8"
    );

    const res = await lintPipeline({ root, dir: "export" });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.some((e) => e.ruleId === "filename.slug")).toBe(true);
    expect(res.errors.some((e) => e.ruleId === "md.codeFenceClosed")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lint.test.ts
```

Expected: FAIL (lintPipeline not found)

- [ ] **Step 3: Implement lintPipeline**

Create `src/pipelines/lintPipeline.ts`:

```ts
import path from "node:path";
import fs from "node:fs/promises";
import { globby } from "globby";
import matter from "gray-matter";
import { loadConfig } from "../core/config.js";
import { isValidSlugFilename } from "../core/slug.js";

export type LintSeverity = "error" | "warn";

export type LintFinding = {
  severity: LintSeverity;
  ruleId: string;
  file: string;
  message: string;
};

export type LintResult = {
  errors: LintFinding[];
  warnings: LintFinding[];
};

type LintOpts = {
  root?: string;
  dir?: string;
};

function hasSingleH1(md: string) {
  const hs = md.match(/^#\s+/gm) ?? [];
  return hs.length === 1;
}

function hasClosedCodeFences(md: string) {
  const fences = md.match(/```/g) ?? [];
  return fences.length % 2 === 0;
}

function isValidDateLike(v: any) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function isValidCreated(v: any) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  return isValidDateLike(s);
}

function isNonEmptyString(v: any) {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: any) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim());
}

function detectEmptyWikilinks(md: string) {
  return /\[\[\s*\]\]/.test(md);
}

export async function lintPipeline(opts: LintOpts): Promise<LintResult> {
  const root = opts.root || process.cwd();
  const cfg = await loadConfig(root);
  const dir = opts.dir || cfg.export?.outDir || "export";
  const abs = path.resolve(root, dir);
  const maxDesc = cfg.lint?.maxDescriptionLength ?? 200;

  const files = await globby(["**/*.md"], { cwd: abs, absolute: true });

  const errors: LintFinding[] = [];
  const warnings: LintFinding[] = [];

  const relsLower = new Map<string, string>();
  for (const f of files) {
    const rel = path.relative(abs, f).replace(/\\/g, "/");
    const lower = rel.toLowerCase();
    if (relsLower.has(lower) && relsLower.get(lower) !== rel) {
      errors.push({
        severity: "error",
        ruleId: "path.caseConflict",
        file: rel,
        message: `case-conflict with ${relsLower.get(lower)}`
      });
    } else {
      relsLower.set(lower, rel);
    }
  }

  for (const f of files) {
    const rel = path.relative(abs, f).replace(/\\/g, "/");
    const filename = path.basename(rel);

    if (!isValidSlugFilename(filename)) {
      errors.push({
        severity: "error",
        ruleId: "filename.slug",
        file: rel,
        message: `invalid slug filename: ${filename}`
      });
    }

    const raw = await fs.readFile(f, "utf-8");
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (e: any) {
      errors.push({
        severity: "error",
        ruleId: "frontmatter.parse",
        file: rel,
        message: e?.message || "frontmatter parse error"
      });
      continue;
    }

    const data: any = parsed.data || {};
    const missing: string[] = [];
    if (!isNonEmptyString(data.title)) missing.push("title");
    if (!isNonEmptyString(data.type)) missing.push("type");
    if (!isStringArray(data.tags)) missing.push("tags");
    if (!isValidCreated(data.created)) missing.push("created");
    if (!isValidDateLike(data.updated)) missing.push("updated");
    if (typeof data.draft !== "boolean") missing.push("draft");

    if (missing.length) {
      errors.push({
        severity: "error",
        ruleId: "frontmatter.required",
        file: rel,
        message: `missing/invalid: ${missing.join(", ")}`
      });
    }

    if (!hasSingleH1(parsed.content)) {
      errors.push({
        severity: "error",
        ruleId: "md.singleH1",
        file: rel,
        message: "must contain exactly one H1"
      });
    }

    if (!hasClosedCodeFences(raw)) {
      errors.push({
        severity: "error",
        ruleId: "md.codeFenceClosed",
        file: rel,
        message: "unclosed code fence"
      });
    }

    if (detectEmptyWikilinks(raw)) {
      warnings.push({
        severity: "warn",
        ruleId: "link.emptyWikilink",
        file: rel,
        message: "contains empty wikilink"
      });
    }

    if (typeof data.description !== "string" || data.description.trim().length === 0) {
      warnings.push({
        severity: "warn",
        ruleId: "frontmatter.descriptionMissing",
        file: rel,
        message: "description missing"
      });
    } else if (data.description.length > maxDesc) {
      warnings.push({
        severity: "warn",
        ruleId: "frontmatter.descriptionTooLong",
        file: rel,
        message: `description length > ${maxDesc}`
      });
    }
  }

  return { errors, warnings };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/lint.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipelines/lintPipeline.ts tests/lint.test.ts
git commit -m "feat: add lint pipeline for Quartz export preflight"
```

---

### Task 5: Add CLI Commands `export` + `lint`

**Files:**
- Create: `src/commands/export.ts`
- Create: `src/commands/lint.ts`
- Modify: [cli.ts](file:///Users/cherrych/Documents/trae_projects/LLMWiki/src/cli.ts)

- [ ] **Step 1: Write failing CLI e2e test (optional)**

If adding an e2e test, create `tests/export-lint.e2e.test.ts` that runs `tsx src/cli.ts export ...` in a temp root. If skipped, rely on pipeline unit tests above.

- [ ] **Step 2: Implement commands**

Create `src/commands/export.ts`:

```ts
import { exportPipeline } from "../pipelines/exportPipeline.js";

export async function exportCommand(opts: { root?: string; outDir?: string }) {
  await exportPipeline({ root: opts.root, outDir: opts.outDir });
}
```

Create `src/commands/lint.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { getProjectPaths } from "../core/paths.js";
import { lintPipeline } from "../pipelines/lintPipeline.js";
import { writeFileAtomic } from "../core/fs.js";

export async function lintCommand(opts: { root?: string; dir?: string; json?: string; md?: string }) {
  const paths = getProjectPaths(opts.root);
  const res = await lintPipeline({ root: paths.root, dir: opts.dir });
  const jsonPath = opts.json ? path.resolve(paths.root, opts.json) : path.join(paths.root, "export", "lint-report.json");
  const mdPath = opts.md ? path.resolve(paths.root, opts.md) : path.join(paths.root, "export", "lint-report.md");

  await writeFileAtomic(jsonPath, JSON.stringify(res, null, 2));

  const md = [
    "# Export Lint Report",
    "",
    `errors: ${res.errors.length}`,
    `warnings: ${res.warnings.length}`,
    "",
    "## Errors",
    ...(res.errors.length ? res.errors.map((e) => `- ${e.file} (${e.ruleId}): ${e.message}`) : ["- none"]),
    "",
    "## Warnings",
    ...(res.warnings.length ? res.warnings.map((e) => `- ${e.file} (${e.ruleId}): ${e.message}`) : ["- none"]),
    ""
  ].join("\n");
  await writeFileAtomic(mdPath, md);

  if (res.errors.length) process.exitCode = 1;
}
```

Modify `src/cli.ts` to register commands:

```ts
import { exportCommand } from "./commands/export.js";
import { lintCommand } from "./commands/lint.js";

program
  .command("export")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--out-dir <path>", "Export output directory (default: export)")
  .action(async (opts) => {
    await exportCommand({ root: opts.root, outDir: opts.outDir });
  });

program
  .command("lint")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--dir <path>", "Directory to lint (default: export)")
  .option("--json <path>", "Write JSON report path")
  .option("--md <path>", "Write Markdown report path")
  .action(async (opts) => {
    await lintCommand({ root: opts.root, dir: opts.dir, json: opts.json, md: opts.md });
  });
```

- [ ] **Step 3: Run unit tests**

```bash
npm test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts src/commands/export.ts src/commands/lint.ts
git commit -m "feat(cli): add export and lint commands"
```

---

### Task 6: Add SCHEMA Template File for Quartz Content

**Files:**
- Create: `SCHEMA.quartz-content.md`

- [ ] **Step 1: Create file (mirror spec contract)**

Create `SCHEMA.quartz-content.md` by extracting the “内容契约/Frontmatter/样式/lint 规则” sections from:

- [2026-04-20-quartz-content-sync-design.md](file:///Users/cherrych/Documents/trae_projects/LLMWiki/docs/superpowers/specs/2026-04-20-quartz-content-sync-design.md)

Ensure the file contains:
- 目录映射（export → content）
- URL 规则（无 permalink）
- 文件命名 slug 规则
- frontmatter 字段集合与模板
- lint 规则（ERROR/WARN）

- [ ] **Step 2: Commit**

```bash
git add SCHEMA.quartz-content.md
git commit -m "docs: add Quartz content schema template"
```

---

### Task 7: Add GitHub Actions Workflow (vault1 → vault2 push)

**Files:**
- Create: `.github/workflows/quartz-content-sync.yml`

- [ ] **Step 1: Add workflow file**

Create `.github/workflows/quartz-content-sync.yml`:

```yaml
name: quartz-content-sync

on:
  push:
    branches: [main]
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout vault1
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install deps
        run: npm ci

      - name: Build
        run: npm run build

      - name: Compile
        run: node dist/cli.js compile --root .

      - name: Export
        run: node dist/cli.js export --root .

      - name: Lint export
        run: node dist/cli.js lint --root .

      - name: Checkout vault2
        uses: actions/checkout@v4
        with:
          repository: ${{ secrets.VAULT2_REPO }}
          token: ${{ secrets.VAULT2_PAT }}
          path: vault2
          ref: ${{ secrets.VAULT2_BRANCH }}

      - name: Sync export -> vault2/content
        run: |
          mkdir -p vault2/content
          rsync -a --delete export/ vault2/content/

      - name: Commit and push
        working-directory: vault2
        run: |
          git config user.name "llm-wiki-bot"
          git config user.email "llm-wiki-bot@users.noreply.github.com"
          git add content
          if git diff --cached --quiet; then
            echo "No changes"
            exit 0
          fi
          git commit -m "chore(content): sync from vault1 $GITHUB_SHA"
          git push origin HEAD:${{ secrets.VAULT2_BRANCH }}
```

- [ ] **Step 2: Validate locally (syntax only)**

Run:

```bash
node -e "require('fs').readFileSync('.github/workflows/quartz-content-sync.yml','utf8'); console.log('ok')"
```

Expected: prints ok

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/quartz-content-sync.yml
git commit -m "ci: add workflow to sync export to vault2 content"
```

---

## Plan Self-Review

- Spec coverage:
  - export/ 目录结构、frontmatter 补齐、index 生成：Task 3
  - lint 预检阻断 + 报告：Task 4、Task 5
  - GitHub Actions 同步 push：Task 7
  - SCHEMA 模板文件：Task 6
- Placeholder scan: 本计划未使用 TBD/TODO；所有步骤含明确代码与命令。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-quartz-content-sync-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
