import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { loadConfig } from "../src/core/config.js";

describe("config: export/lint defaults", () => {
  it("applies defaults for export/lint sections", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "llm-wiki-cfg-"));
    await fs.mkdir(path.join(root, "config"), { recursive: true });
    await fs.writeFile(
      path.join(root, "config", "llm-wiki.config.json"),
      JSON.stringify({
        paths: { rawDir: "raw", wikiDir: "wiki", outputsDir: "outputs", stateDir: ".llm-wiki" },
        provider: { type: "volcengine", model: "x", temperature: 0.2, maxTokens: 10 },
        export: {},
        lint: {}
      }),
      "utf-8"
    );

    const cfg = await loadConfig(root);
    expect(cfg.export?.outDir).toBe("export");
    expect(cfg.export?.includeAssets).toBe(false);
    expect(cfg.lint?.maxDescriptionLength).toBe(200);
    expect(cfg.lint?.linkCheck).toBe(false);
  });
});
