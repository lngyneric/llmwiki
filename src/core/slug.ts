const ILLEGAL = /[:?#\\\"'*<>|]/g;

export function toSlug(input: string) {
  const s = (input || "")
    .trim()
    .toLowerCase()
    .replace(ILLEGAL, "-")
    .replace(/[^a-z0-9\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "untitled";
}

export function isValidSlugFilename(name: string) {
  if (!name.endsWith(".md")) return false;
  const base = name.slice(0, -3);
  if (!base) return false;
  if (/[A-Z]/.test(base)) return false;
  if (/\s/.test(base)) return false;
  if (ILLEGAL.test(base)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base);
}

