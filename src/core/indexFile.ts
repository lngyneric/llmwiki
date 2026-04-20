import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, writeFileAtomic } from "./fs.js";

function toLink(p: string) {
  return `[[${p.replace(/\.md$/, "")}]]`;
}

export async function updateWikiIndex(opts: {
  root: string;
  wikiDir: string;
  summaries: string[];
  concepts: string[];
  authoritative: string[];
  outputs: string[];
}) {
  const indexAbs = path.join(opts.root, opts.wikiDir, "index.md");
  const sections = [
    { title: "Summaries", items: opts.summaries },
    { title: "Concepts", items: opts.concepts },
    { title: "Authoritative", items: opts.authoritative },
    { title: "Outputs", items: opts.outputs }
  ];

  const header = "# Wiki Index\n\n";
  const existing = (await fileExists(indexAbs)) ? await fs.readFile(indexAbs, "utf-8") : header;

  const normalized = new Map<string, Set<string>>();
  for (const sec of sections) normalized.set(sec.title, new Set(sec.items.map((x) => x.replace(/\\/g, "/"))));

  const out: string[] = [header.trimEnd(), ""];
  for (const sec of sections) {
    out.push(`## ${sec.title}`);
    out.push("");
    const uniq = Array.from(normalized.get(sec.title) ?? []).sort();
    if (uniq.length === 0) out.push("- (none)");
    else for (const item of uniq) out.push(`- ${toLink(item)}`);
    out.push("");
  }

  const next = out.join("\n");
  if (existing.trim() === next.trim()) return;
  await writeFileAtomic(indexAbs, next);
}

