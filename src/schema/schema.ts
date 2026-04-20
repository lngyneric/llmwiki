import fs from "node:fs";
import path from "node:path";

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
  return p.replace(/\\/g, "/").replace(/\/+$/g, "").replace(/^\.?\//, "");
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

export function parseSchemaMarkdown(md: string): SchemaParseResult {
  const expectedPaths: string[] = [];
  const expectedFiles: string[] = [];

  const codeBlocks = md.match(/```[\s\S]*?```/g) ?? [];
  for (const blk of codeBlocks) {
    const lines = blk
      .replace(/^```[a-zA-Z0-9-]*\n?/, "")
      .replace(/```$/, "")
      .split("\n");
    const dirStack: string[] = [];
    for (const line of lines) {
      const idx = Math.max(line.indexOf("├──"), line.indexOf("└──"));
      if (idx < 0) continue;
      const depth = Math.floor(idx / 4);
      const m = line.match(/(?:├──|└──)\s*([^#]+?)(?:\s+#.*)?$/);
      if (!m) continue;
      const raw = m[1].trim();
      if (!raw) continue;
      const isDir = raw.endsWith("/");
      const name = normalizePath(isDir ? raw.slice(0, -1) : raw);
      if (!name) continue;

      if (isDir) {
        dirStack.length = depth;
        dirStack[depth] = name;
        expectedPaths.push(normalizePath(dirStack.join("/")));
      } else {
        const parents = dirStack.slice(0, depth).filter(Boolean);
        expectedFiles.push(normalizePath([...parents, name].join("/")));
      }
    }
  }

  const headingMatches = md.match(/\([^\n]*?\/[\)]/g) ?? [];
  for (const h of headingMatches) {
    const m = h.match(/\(([^\)]+\/?)\)/);
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

export function getProjectCapabilities(root = process.cwd()): CapabilityItem[] {
  const rels: CapabilityItem[] = [
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
    { id: "wiki/index.md", kind: "file", title: "wiki/index.md 索引" }
  ];

  const existing = rels.filter((x) => fs.existsSync(path.join(root, x.id)));

  return [
    ...existing,
    { id: "init", kind: "command", title: "CLI init" },
    { id: "compile", kind: "command", title: "CLI compile" },
    { id: "query", kind: "command", title: "CLI query" },
    { id: "status", kind: "command", title: "CLI status" },
    { id: "schema", kind: "command", title: "CLI schema" }
  ];
}

export function diffSchemaAgainstProject(schema: SchemaParseResult, root = process.cwd()): SchemaDiff {
  const caps = getProjectCapabilities(root);
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
