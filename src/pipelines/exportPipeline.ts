import path from "node:path";
import fs from "node:fs/promises";
import { globby } from "globby";
import matter from "gray-matter";
import { loadConfig } from "../core/config.js";
import { ensureDir, writeFileAtomic, fileExists } from "../core/fs.js";
import { toSlug } from "../core/slug.js";

type ExportOpts = {
  root?: string;
  outDir?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureArrayTags(tags: any) {
  if (Array.isArray(tags)) return tags.filter((x) => typeof x === "string" && x.trim());
  if (typeof tags === "string" && tags.trim()) return [tags.trim()];
  return [];
}

function extractFirstH1(content: string) {
  const m = content.match(/^#\s+(.+)\s*$/m);
  return m ? m[1].trim() : "";
}

function withEnrichedFrontmatter(params: {
  raw: string;
  type: "summary" | "concept" | "authoritative" | "output" | "index";
  defaultTags: string[];
  fallbackTitle: string;
}) {
  const parsed = matter(params.raw);
  const data: any = { ...(parsed.data || {}) };
  const title = (data.title && String(data.title).trim()) || extractFirstH1(parsed.content) || params.fallbackTitle;

  const created = data.created ? String(data.created).trim() : today();
  const updated = data.updated ? String(data.updated).trim() : nowIso();

  const tags = ensureArrayTags(data.tags);
  const finalTags = tags.length ? tags : params.defaultTags;

  const description = data.description ? String(data.description).trim() : "";
  const aliases = Array.isArray(data.aliases) ? data.aliases : [];

  const outData = {
    ...data,
    title,
    type: params.type,
    tags: finalTags,
    created,
    updated,
    draft: typeof data.draft === "boolean" ? data.draft : false,
    description,
    aliases
  };

  return matter.stringify(parsed.content, outData);
}

async function emptyDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
}

async function exportIndexPages(outRoot: string) {
  const index = [
    "---",
    'title: "Index"',
    "type: index",
    'description: "Site entry"',
    "tags: [index]",
    `created: ${today()}`,
    `updated: ${nowIso()}`,
    "draft: false",
    "aliases: []",
    "---",
    "",
    "# Index",
    "- [[summaries/index]]",
    "- [[concepts/index]]",
    "- [[authoritative/index]]",
    "- [[outputs/index]]",
    ""
  ].join("\n");

  const sections: Array<{ dir: string; title: string; tags: string[] }> = [
    { dir: "summaries", title: "Summaries", tags: ["index", "summary"] },
    { dir: "concepts", title: "Concepts", tags: ["index", "concept"] },
    { dir: "authoritative", title: "Authoritative", tags: ["index", "authoritative"] },
    { dir: "outputs", title: "Outputs", tags: ["index", "output"] }
  ];

  await writeFileAtomic(path.join(outRoot, "index.md"), index);

  for (const s of sections) {
    const p = path.join(outRoot, s.dir, "index.md");
    const body = [
      "---",
      `title: "${s.title}"`,
      "type: index",
      `description: "${s.title} index"`,
      `tags: [${s.tags.join(", ")}]`,
      `created: ${today()}`,
      `updated: ${nowIso()}`,
      "draft: false",
      "aliases: []",
      "---",
      "",
      `# ${s.title}`,
      ""
    ].join("\n");
    await writeFileAtomic(p, body);
  }
}

export async function exportPipeline(opts: ExportOpts) {
  const root = opts.root || process.cwd();
  const cfg = await loadConfig(root);
  const outDirRel = opts.outDir || cfg.export?.outDir || "export";
  const outRoot = path.resolve(root, outDirRel);
  const wikiRoot = path.resolve(root, cfg.paths.wikiDir);
  const outputsRoot = path.resolve(root, cfg.paths.outputsDir);

  await emptyDir(outRoot);

  const groups: Array<{ inDir: string; outDir: string; type: any; tags: string[] }> = [
    { inDir: path.join(wikiRoot, "summaries"), outDir: "summaries", type: "summary", tags: ["summary", "ingest"] },
    { inDir: path.join(wikiRoot, "concepts"), outDir: "concepts", type: "concept", tags: ["concept"] },
    { inDir: path.join(wikiRoot, "authoritative"), outDir: "authoritative", type: "authoritative", tags: ["authoritative"] }
  ];

  for (const g of groups) {
    if (!(await fileExists(g.inDir))) continue;
    const files = await globby(["**/*.md"], { cwd: g.inDir, absolute: true });
    for (const abs of files) {
      const rel = path.relative(g.inDir, abs).replace(/\\/g, "/");
      const base = path.basename(rel, ".md");
      const safe = `${toSlug(base)}.md`;
      const outAbs = path.join(outRoot, g.outDir, path.dirname(rel), safe);
      const raw = await fs.readFile(abs, "utf-8");
      const out = withEnrichedFrontmatter({
        raw,
        type: g.type,
        defaultTags: g.tags,
        fallbackTitle: base
      });
      await writeFileAtomic(outAbs, out);
    }
  }

  if (await fileExists(outputsRoot)) {
    const files = await globby(["**/*.md"], { cwd: outputsRoot, absolute: true });
    for (const abs of files) {
      const rel = path.relative(outputsRoot, abs).replace(/\\/g, "/");
      const base = path.basename(rel, ".md");
      const safe = `${toSlug(base)}.md`;
      const outAbs = path.join(outRoot, "outputs", path.dirname(rel), safe);
      const raw = await fs.readFile(abs, "utf-8");
      const out = withEnrichedFrontmatter({
        raw,
        type: "output",
        defaultTags: ["output"],
        fallbackTitle: base
      });
      await writeFileAtomic(outAbs, out);
    }
  }

  await exportIndexPages(outRoot);
}

