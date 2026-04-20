import path from "node:path";
import fs from "node:fs/promises";
import { globby } from "globby";
import matter from "gray-matter";
import { loadConfig } from "../core/config.js";
import { isValidSlugFilename } from "../core/slug.js";

export type LintSeverity = "error" | "warn";

export type LintFinding = {
  severity: LintSeverity;
  ruleId: string;
  file: string;
  message: string;
};

export type LintResult = {
  errors: LintFinding[];
  warnings: LintFinding[];
};

type LintOpts = {
  root?: string;
  dir?: string;
};

function hasSingleH1(md: string) {
  const hs = md.match(/^#\s+/gm) ?? [];
  return hs.length === 1;
}

function hasClosedCodeFences(md: string) {
  const fences = md.match(/```/g) ?? [];
  return fences.length % 2 === 0;
}

function isValidDateLike(v: any) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function isValidCreated(v: any) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  return isValidDateLike(s);
}

function isNonEmptyString(v: any) {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: any) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.trim());
}

function detectEmptyWikilinks(md: string) {
  return /\[\[\s*\]\]/.test(md);
}

export async function lintPipeline(opts: LintOpts): Promise<LintResult> {
  const root = opts.root || process.cwd();
  const cfg = await loadConfig(root);
  const dir = opts.dir || cfg.export?.outDir || "export";
  const abs = path.resolve(root, dir);
  const maxDesc = cfg.lint?.maxDescriptionLength ?? 200;

  const files = await globby(["**/*.md"], { cwd: abs, absolute: true });

  const errors: LintFinding[] = [];
  const warnings: LintFinding[] = [];

  const relsLower = new Map<string, string>();
  for (const f of files) {
    const rel = path.relative(abs, f).replace(/\\/g, "/");
    const lower = rel.toLowerCase();
    if (relsLower.has(lower) && relsLower.get(lower) !== rel) {
      errors.push({
        severity: "error",
        ruleId: "path.caseConflict",
        file: rel,
        message: `case-conflict with ${relsLower.get(lower)}`
      });
    } else {
      relsLower.set(lower, rel);
    }
  }

  for (const f of files) {
    const rel = path.relative(abs, f).replace(/\\/g, "/");
    const filename = path.basename(rel);

    if (!isValidSlugFilename(filename)) {
      errors.push({
        severity: "error",
        ruleId: "filename.slug",
        file: rel,
        message: `invalid slug filename: ${filename}`
      });
    }

    const raw = await fs.readFile(f, "utf-8");
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (e: any) {
      errors.push({
        severity: "error",
        ruleId: "frontmatter.parse",
        file: rel,
        message: e?.message || "frontmatter parse error"
      });
      continue;
    }

    const data: any = parsed.data || {};
    const missing: string[] = [];
    if (!isNonEmptyString(data.title)) missing.push("title");
    if (!isNonEmptyString(data.type)) missing.push("type");
    if (!isStringArray(data.tags)) missing.push("tags");
    if (!isValidCreated(data.created)) missing.push("created");
    if (!isValidDateLike(data.updated)) missing.push("updated");
    if (typeof data.draft !== "boolean") missing.push("draft");

    if (missing.length) {
      errors.push({
        severity: "error",
        ruleId: "frontmatter.required",
        file: rel,
        message: `missing/invalid: ${missing.join(", ")}`
      });
    }

    if (!hasSingleH1(parsed.content)) {
      errors.push({
        severity: "error",
        ruleId: "md.singleH1",
        file: rel,
        message: "must contain exactly one H1"
      });
    }

    if (!hasClosedCodeFences(raw)) {
      errors.push({
        severity: "error",
        ruleId: "md.codeFenceClosed",
        file: rel,
        message: "unclosed code fence"
      });
    }

    if (detectEmptyWikilinks(raw)) {
      warnings.push({
        severity: "warn",
        ruleId: "link.emptyWikilink",
        file: rel,
        message: "contains empty wikilink"
      });
    }

    if (typeof data.description !== "string" || data.description.trim().length === 0) {
      warnings.push({
        severity: "warn",
        ruleId: "frontmatter.descriptionMissing",
        file: rel,
        message: "description missing"
      });
    } else if (data.description.length > maxDesc) {
      warnings.push({
        severity: "warn",
        ruleId: "frontmatter.descriptionTooLong",
        file: rel,
        message: `description length > ${maxDesc}`
      });
    }
  }

  return { errors, warnings };
}

