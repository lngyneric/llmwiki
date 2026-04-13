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

