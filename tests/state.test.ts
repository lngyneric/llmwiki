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

