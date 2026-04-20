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

