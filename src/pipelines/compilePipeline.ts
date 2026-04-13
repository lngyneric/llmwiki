import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { getProjectPaths } from "../core/paths.js";
import { sha256File } from "../core/hash.js";
import { loadConfig } from "../core/config.js";
import { loadIndex, saveIndex } from "../core/state.js";
import { writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { VolcengineProvider } from "../provider/volcengine.js";
import { compileSystemPrompt, compileUserPrompt } from "../templates/defaultPrompts.js";

function wikiPathForRaw(root: string, rawAbs: string): string {
  const rel = path.relative(path.join(root, "raw"), rawAbs);
  const noExt = rel.replace(/\.(md|txt)$/i, "");
  return path.join(root, "wiki", "sources", `${noExt}.md`);
}

export async function compilePipeline(opts: { root?: string; full?: boolean }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);

  const cfg = await loadConfig(root);
  const index = await loadIndex(paths.indexFile);

  const rawFiles = await globby(["**/*.md", "**/*.txt"], { cwd: paths.rawDir, absolute: true });

  const provider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens
  });

  const updated: string[] = [];
  const errors: string[] = [];

  for (const f of rawFiles) {
    const relKey = path.relative(root, f).replace(/\\/g, "/");
    const sha = await sha256File(f);
    const prev = index.raw[relKey];
    const needs = !!opts.full || !prev || prev.sha256 !== sha;
    if (!needs) continue;

    try {
      const rawText = await fs.readFile(f, "utf-8");
      const out = await provider.generateText({
        system: compileSystemPrompt,
        prompt: compileUserPrompt(relKey, rawText)
      });

      const wikiAbs = wikiPathForRaw(root, f);
      const header = [
        "---",
        `source: ${relKey}`,
        `raw_sha256: ${sha}`,
        `compiled_at: ${new Date().toISOString()}`,
        "---",
        ""
      ].join("\n");
      await writeFileAtomic(wikiAbs, header + out.text.trim() + "\n");
      updated.push(path.relative(root, wikiAbs).replace(/\\/g, "/"));

      index.raw[relKey] = { sha256: sha, lastCompiledAt: new Date().toISOString(), status: "ok" };
    } catch (e: any) {
      const msg = e?.stack || e?.message || String(e);
      errors.push(`${relKey}: ${msg}`);
      index.raw[relKey] = {
        sha256: sha,
        lastCompiledAt: new Date().toISOString(),
        status: "error",
        error: msg
      };
    }
  }

  await saveIndex(paths.indexFile, index);

  await appendLog(paths.logFile, "compile", [
    `rawTotal: ${rawFiles.length}`,
    `wikiUpdated: ${updated.length}`,
    ...(updated.length ? updated.map((p) => `wiki: ${p}`) : []),
    ...(errors.length ? ["status: error", ...errors.map((x) => `error: ${x}`)] : ["status: ok"])
  ]);

  return { updated, errors };
}

