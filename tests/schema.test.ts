import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { diffSchemaAgainstProject, parseSchemaMarkdown } from "../src/schema/schema.js";

describe("schema diff", () => {
  it("extracts expected dirs and detects missing items", async () => {
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
    ].join("\n");

    const schema = parseSchemaMarkdown(md);
    expect(schema.expectedPaths).toContain("wiki/entities");
    expect(schema.expectedPaths).toContain("wiki/summaries");
    expect(schema.expectedFiles).toContain("wiki/index.md");
    expect(schema.expectedFiles).toContain("wiki/log.md");

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-schema-"));
    await fs.mkdir(path.join(root, "wiki"), { recursive: true });
    await fs.writeFile(path.join(root, "wiki", "log.md"), "x");
    const diff = diffSchemaAgainstProject(schema, root);
    expect(diff.missing.some((x) => x.id === "wiki/index.md")).toBe(true);
  });
});
