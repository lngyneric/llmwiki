import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { compilePipeline } from "../src/pipelines/compilePipeline.js";
import { writeFileAtomic } from "../src/core/fs.js";

function mockFetch() {
  return async () =>
    ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        choices: [{ message: { content: `<wiki># T\ncontent</wiki>\n<concepts>[]</concepts>` } }]
      }),
      text: async () => "ok"
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

    await compilePipeline({ root, fetcher: mockFetch() as any });

    await fs.access(path.join(root, "wiki", "summaries", "a.md"));
    const index = await fs.readFile(path.join(root, "wiki", "index.md"), "utf-8");
    expect(index).toContain("wiki/summaries/a");
  });
});

