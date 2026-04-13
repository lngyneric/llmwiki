import { describe, it, expect } from "vitest";
import { ConfigSchema } from "../src/core/config.js";

describe("ConfigSchema", () => {
  it("parses minimal config", () => {
    const cfg = ConfigSchema.parse({
      paths: {},
      provider: { type: "volcengine", model: "m" }
    });
    expect(cfg.provider.model).toBe("m");
    expect(cfg.compile.concurrency).toBe(2);
  });
});

