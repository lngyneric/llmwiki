import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { lintPipeline } from "../src/pipelines/lintPipeline.js";

describe("lintPipeline", () => {
  it("returns errors for invalid frontmatter and filename", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-lint-"));
    await fs.mkdir(path.join(root, "export", "summaries"), { recursive: true });
    await fs.mkdir(path.join(root, "config"), { recursive: true });

    await fs.writeFile(
      path.join(root, "config", "llm-wiki.config.json"),
      JSON.stringify({
        paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
        provider: { type: "volcengine", model: "x", temperature: 0.2, maxTokens: 10 },
        export: { outDir: "export" }
      }),
      "utf-8"
    );

    await fs.writeFile(
      path.join(root, "export", "summaries", "Bad Name.md"),
      ["---", "title: A: B", "type: summary", "tags: [x]", "---", "", "# T"].join("\n"),
      "utf-8"
    );

    await fs.writeFile(
      path.join(root, "export", "summaries", "ok.md"),
      [
        "---",
        "title: ok",
        "type: summary",
        "tags: [x]",
        "created: 2026-04-20",
        "updated: 2026-04-20T00:00:00.000Z",
        "draft: false",
        "---",
        "",
        "# ok",
        "",
        "```js",
        "const x = 1"
      ].join("\n"),
      "utf-8"
    );

    const res = await lintPipeline({ root, dir: "export" });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.some((e) => e.ruleId === "filename.slug")).toBe(true);
    expect(res.errors.some((e) => e.ruleId === "md.codeFenceClosed")).toBe(true);
  });
});

