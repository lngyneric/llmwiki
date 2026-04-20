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
      [
        "---",
        "source: raw/hello.md",
        "raw_sha256: abc",
        "compiled_at: 2026-04-20T00:00:00.000Z",
        "---",
        "",
        "# Hello",
        "",
        "body"
      ].join("\n"),
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

