import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";
import { getProjectPaths } from "../core/paths.js";
import { sha256File } from "../core/hash.js";
import { loadConfig } from "../core/config.js";
import { loadIndex, saveIndex, loadEmbeddings, saveEmbeddings } from "../core/state.js";
import { fileExists, writeFileAtomic } from "../core/fs.js";
import { appendLog } from "../core/log.js";
import { updateWikiIndex } from "../core/indexFile.js";
import { VolcengineProvider } from "../provider/volcengine.js";
import { compileSystemPrompt, compileUserPrompt, updateSystemPrompt, updateUserPrompt, authoritativeUpdateSystemPrompt, authoritativeUpdateUserPrompt } from "../templates/defaultPrompts.js";

function wikiPathForRaw(root: string, rawDir: string, wikiDir: string, rawAbs: string): string {
  const rel = path.relative(path.resolve(root, rawDir), rawAbs);
  const noExt = rel.replace(/\.(md|txt)$/i, "");
  return path.join(path.resolve(root, wikiDir), "summaries", `${noExt}.md`);
}

async function migrateSourcesToSummaries(wikiDirAbs: string) {
  const sourcesDir = path.join(wikiDirAbs, "sources");
  const summariesDir = path.join(wikiDirAbs, "summaries");

  if (await fileExists(summariesDir)) return;
  if (!(await fileExists(sourcesDir))) return;

  const moveDirRecursive = async (from: string, to: string) => {
    await fs.mkdir(to, { recursive: true });
    const entries = await fs.readdir(from, { withFileTypes: true });
    for (const ent of entries) {
      const src = path.join(from, ent.name);
      const dst = path.join(to, ent.name);
      if (ent.isDirectory()) {
        await moveDirRecursive(src, dst);
        await fs.rmdir(src);
        continue;
      }
      try {
        await fs.rename(src, dst);
      } catch {
        await fs.copyFile(src, dst);
        await fs.unlink(src);
      }
    }
  };

  try {
    await fs.rename(sourcesDir, summariesDir);
  } catch {
    await moveDirRecursive(sourcesDir, summariesDir);
    await fs.rmdir(sourcesDir);
  }
}

export async function compilePipeline(opts: { root?: string; full?: boolean; fetcher?: typeof fetch }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);

  const cfg = await loadConfig(root);
  const index = await loadIndex(paths.indexFile);
  const embeddingsFile = path.join(paths.stateDir, "embeddings.json");
  const embeddingsState = await loadEmbeddings(embeddingsFile);

  await migrateSourcesToSummaries(path.resolve(root, cfg.paths.wikiDir));

  const rawDir = path.resolve(root, cfg.paths.rawDir);
  const rawFiles = await globby(["**/*.md", "**/*.txt"], { cwd: rawDir, absolute: true });

  const textProvider = new VolcengineProvider({
    model: cfg.provider.model,
    baseUrl: cfg.provider.baseUrl,
    apiKey: cfg.provider.apiKey,
    temperature: cfg.provider.temperature,
    maxTokens: cfg.provider.maxTokens,
    fetcher: opts.fetcher
  });

  let embedProvider: VolcengineProvider | null = null;
  if (cfg.embedding?.enabled) {
    embedProvider = new VolcengineProvider({
      model: cfg.embedding.model,
      baseUrl: cfg.embedding.baseUrl,
      apiKey: cfg.embedding.apiKey,
      fetcher: opts.fetcher
    });
  }

  const updated: Array<{ file: string; language: string }> = [];
  const errors: string[] = [];

  for (const f of rawFiles) {
    const relKey = path.relative(root, f).replace(/\\/g, "/");
    const sha = await sha256File(f);
    const prev = index.raw[relKey];
    // 增量判断：hash 变化 或 上次失败（允许重试） 或 full
    const needs = !!opts.full || !prev || prev.sha256 !== sha || prev.status === "error";
    if (!needs) {
      // 即使文件没有变化，我们也检查一下它是否缺少 embedding 向量，如果缺少则补齐
      const wikiAbs = wikiPathForRaw(root, cfg.paths.rawDir, cfg.paths.wikiDir, f);
      const wikiRel = path.relative(root, wikiAbs).replace(/\\/g, "/");
      
      if (await fileExists(wikiAbs)) {
        const wikiSha = await sha256File(wikiAbs);
        const prevEmb = embeddingsState[wikiRel];
        
        // 如果 vector 不存在，或者 wiki 页面已被手动修改导致 hash 不匹配
        if (!prevEmb || prevEmb.hash !== wikiSha) {
          if (embedProvider) {
            try {
              const wikiContent = await fs.readFile(wikiAbs, "utf-8");
              // NVIDIA/开源模型通常有更小的 token 窗口限制（如 512 tokens）
              const contentForEmbedding = wikiContent.slice(0, 1500); 
              const vectors = await embedProvider.generateEmbeddings([contentForEmbedding]);
              if (vectors && vectors.length > 0) {
                embeddingsState[wikiRel] = { hash: wikiSha, vector: vectors[0] };
                await saveEmbeddings(embeddingsFile, embeddingsState);
              }
            } catch (embErr: any) {
              console.error("Embedding generation failed during skip for", wikiRel, embErr.message);
              errors.push(`Embedding failed for ${wikiRel}: ${embErr.message}`);
            }
          }
        }
      }
      continue;
    }

    try {
      const rawText = await fs.readFile(f, "utf-8");
      const wikiAbs = wikiPathForRaw(root, cfg.paths.rawDir, cfg.paths.wikiDir, f);
      const wikiRel = path.relative(root, wikiAbs).replace(/\\/g, "/");

      let rawOutText = "";
      
      const langInstruction = cfg.compile.language && cfg.compile.language !== "中文"
        ? `\n\n[CRITICAL INSTRUCTION: The user has specified the output language as: ${cfg.compile.language}. ${cfg.compile.language === "Original" ? "You MUST strictly output the ENTIRE Markdown content and Concepts in the EXACT SAME LANGUAGE as the source text. DO NOT translate it into Chinese." : `You MUST strictly output the ENTIRE Markdown content and Concepts in ${cfg.compile.language}.`}]`
        : "";

      const userLangInstruction = cfg.compile.language && cfg.compile.language !== "中文"
        ? `\n\n[CRITICAL REPEAT: OUTPUT MUST BE IN ${cfg.compile.language === "Original" ? "THE ORIGINAL LANGUAGE OF THE SOURCE TEXT" : cfg.compile.language}. DO NOT OUTPUT IN CHINESE UNLESS THE SOURCE IS CHINESE.]`
        : "";

      if (await fileExists(wikiAbs)) {
        // Update Mode
        const existingWiki = await fs.readFile(wikiAbs, "utf-8");
        const out = await textProvider.generateText({
          system: updateSystemPrompt + langInstruction,
          prompt: updateUserPrompt(relKey, existingWiki, rawText) + userLangInstruction
        });
        rawOutText = out.text.trim();
      } else {
        // Create Mode
        const out = await textProvider.generateText({
          system: compileSystemPrompt + langInstruction,
          prompt: compileUserPrompt(relKey, rawText) + userLangInstruction
        });
        rawOutText = out.text.trim();
      }

      let wikiContent = rawOutText;
      let concepts: Array<{name: string, description: string}> = [];

      const wikiMatch = rawOutText.match(/<wiki>([\s\S]*?)<\/wiki>/);
      const conceptsMatch = rawOutText.match(/<concepts>([\s\S]*?)<\/concepts>/);

      if (wikiMatch) {
        wikiContent = wikiMatch[1].trim();
      }
      
      if (conceptsMatch) {
        try {
          concepts = JSON.parse(conceptsMatch[1].trim());
        } catch (e) {
          console.error("Failed to parse concepts JSON for", relKey);
        }
      }

      const header = [
        "---",
        `source: ${relKey}`,
        `raw_sha256: ${sha}`,
        `compiled_at: ${new Date().toISOString()}`,
        "---",
        ""
      ].join("\n");
      
      const finalContent = header + wikiContent + "\n";
      await writeFileAtomic(wikiAbs, finalContent);
      updated.push({ file: wikiRel, language: cfg.compile.language || "中文" });

      // --- Concept Processing ---
      const conceptsDir = path.join(root, cfg.paths.wikiDir, "concepts");
      if (concepts.length > 0) {
        await fs.mkdir(conceptsDir, { recursive: true });
        const dateStr = new Date().toISOString().split("T")[0];
        
        for (const concept of concepts) {
          const safeName = concept.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "");
          if (!safeName) continue;
          
          const conceptFile = path.join(conceptsDir, `${safeName}.md`);
          const logEntry = `- ${dateStr}: 来自 [[${wikiRel.replace(/\.md$/, "")}]] 的认知：${concept.description}`;
          
          if (await fileExists(conceptFile)) {
            const existingContent = await fs.readFile(conceptFile, "utf-8");
            if (existingContent.includes("## Evolution Log")) {
              const newContent = existingContent.replace("## Evolution Log\n", `## Evolution Log\n${logEntry}\n`);
              await writeFileAtomic(conceptFile, newContent);
            } else {
              await writeFileAtomic(conceptFile, existingContent + `\n\n## Evolution Log\n${logEntry}\n`);
            }
          } else {
            const initialContent = `---
type: concept
title: "${concept.name}"
date: ${dateStr}
tags: [wiki, wiki/concept]
---

# ${concept.name}

## Evolution Log
${logEntry}
`;
            await writeFileAtomic(conceptFile, initialContent);
          }
        }
      }
      // ------------------------

      if (embedProvider) {
        try {
          // NVIDIA/开源模型通常有更小的 token 窗口限制（如 512 tokens）
          const contentForEmbedding = finalContent.slice(0, 1500); 
          const vectors = await embedProvider.generateEmbeddings([contentForEmbedding]);
          if (vectors && vectors.length > 0) {
            const vector = vectors[0];
            const wikiSha = await sha256File(wikiAbs);
            embeddingsState[wikiRel] = { hash: wikiSha, vector };
            await saveEmbeddings(embeddingsFile, embeddingsState);
          }
        } catch (embErr: any) {
          console.error("Embedding generation failed for", wikiRel, embErr.message);
          errors.push(`Embedding failed for ${wikiRel}: ${embErr.message}`);
        }
      }

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

  const authDir = path.resolve(root, cfg.paths.wikiDir, "authoritative");
  if (await fileExists(authDir)) {
    const authFiles = await globby(["**/*.md"], { cwd: authDir, absolute: true });
    for (const af of authFiles) {
      const content = await fs.readFile(af, "utf-8");
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!yamlMatch) continue;
      
      const yamlStr = yamlMatch[1];
      const lastUpdatedMatch = yamlStr.match(/last_updated:\s*([^\n]+)/);
      if (!lastUpdatedMatch) continue;
      
      const lastUpdatedDate = new Date(lastUpdatedMatch[1].trim());
      
      const sourcesMatch = yamlStr.match(/sources:\n([\s\S]*?)(?=\n\w|$)/);
      if (!sourcesMatch) continue;
      
      const sourceLines = sourcesMatch[1].split("\n").map(l => l.trim().replace(/^- /, ""));
      let needsUpdate = false;
      const newSourceContents: string[] = [];

      for (const src of sourceLines) {
        if (!src) continue;
        const normalizedSrc = src.replace(/^wiki\/sources\//, "wiki/summaries/");
        // Map wiki/sources/xxxx.md back to raw key to check index
        const rawKeyMatch = Object.keys(index.raw).find(k => {
          const expectedWiki = wikiPathForRaw(root, cfg.paths.rawDir, cfg.paths.wikiDir, path.join(root, cfg.paths.rawDir, k));
          const expectedRel = path.relative(root, expectedWiki).replace(/\\/g, "/");
          return expectedRel === normalizedSrc;
        });

        if (rawKeyMatch && index.raw[rawKeyMatch] && index.raw[rawKeyMatch].lastCompiledAt) {
          const compiledAt = new Date(index.raw[rawKeyMatch].lastCompiledAt!);
          if (compiledAt > lastUpdatedDate) {
            needsUpdate = true;
          }
        }
        
        // Load source content anyway in case we need to update
        const srcAbs = path.resolve(root, normalizedSrc);
        if (await fileExists(srcAbs)) {
          const srcText = await fs.readFile(srcAbs, "utf-8");
          newSourceContents.push(`### 来源：[[${normalizedSrc}]]\n${srcText}`);
        }
      }

      if (needsUpdate) {
        console.log("Auto-updating authoritative file:", af);
        
        const langInstruction = cfg.compile.language && cfg.compile.language !== "中文"
          ? `\n\n[CRITICAL INSTRUCTION: The user has specified the output language as: ${cfg.compile.language}. ${cfg.compile.language === "Original" ? "You MUST strictly output the ENTIRE Markdown content in the EXACT SAME LANGUAGE as the source text. DO NOT translate it into Chinese." : `You MUST strictly output the ENTIRE Markdown content in ${cfg.compile.language}.`}]`
          : "";
          
        const userLangInstruction = cfg.compile.language && cfg.compile.language !== "中文"
          ? `\n\n[CRITICAL REPEAT: OUTPUT MUST BE IN ${cfg.compile.language === "Original" ? "THE ORIGINAL LANGUAGE OF THE SOURCE TEXT" : cfg.compile.language}. DO NOT OUTPUT IN CHINESE UNLESS THE SOURCE IS CHINESE.]`
          : "";

        try {
          const out = await textProvider.generateText({
            system: authoritativeUpdateSystemPrompt + langInstruction,
            prompt: authoritativeUpdateUserPrompt(content, newSourceContents.join("\n\n")) + userLangInstruction
          });
          
          const newTimestamp = new Date().toISOString();
          const newYamlStr = yamlStr.replace(/last_updated:\s*[^\n]+/, `last_updated: ${newTimestamp}`);
          const newContent = out.text.trim();
          
          // Ensure new content doesn't duplicate the yaml if the LLM outputted it
          let finalContent = newContent;
          if (finalContent.startsWith("---")) {
             finalContent = finalContent.replace(/^---[\s\S]*?---\n/, "");
          }
          
          await writeFileAtomic(af, `---\n${newYamlStr}\n---\n\n${finalContent}`);
          updated.push({ file: path.relative(root, af).replace(/\\/g, "/"), language: cfg.compile.language || "中文" });
        } catch (e: any) {
          console.error("Failed to update authoritative file:", af, e.message);
          errors.push(`Authoritative update failed for ${af}: ${e.message}`);
        }
      }
    }
  }

  await saveIndex(paths.indexFile, index);
  await saveEmbeddings(embeddingsFile, embeddingsState);

  const wikiDirAbs = path.resolve(root, cfg.paths.wikiDir);
  const summariesAbs = path.join(wikiDirAbs, "summaries");
  const conceptsAbs = path.join(wikiDirAbs, "concepts");
  const authoritativeAbs = path.join(wikiDirAbs, "authoritative");
  const outputsAbs = path.resolve(root, cfg.paths.outputsDir);

  const summaries = (await fileExists(summariesAbs))
    ? (await globby(["**/*.md"], { cwd: summariesAbs, absolute: true })).map((x) => path.relative(root, x).replace(/\\/g, "/"))
    : [];

  const concepts = (await fileExists(conceptsAbs))
    ? (await globby(["**/*.md"], { cwd: conceptsAbs, absolute: true })).map((x) => path.relative(root, x).replace(/\\/g, "/"))
    : [];

  const authoritative = (await fileExists(authoritativeAbs))
    ? (await globby(["**/*.md"], { cwd: authoritativeAbs, absolute: true })).map((x) => path.relative(root, x).replace(/\\/g, "/"))
    : [];

  const outputs = (await fileExists(outputsAbs))
    ? (await globby(["**/*.md"], { cwd: outputsAbs, absolute: true })).map((x) => path.relative(root, x).replace(/\\/g, "/"))
    : [];

  await updateWikiIndex({
    root,
    wikiDir: cfg.paths.wikiDir,
    summaries,
    concepts,
    authoritative,
    outputs
  });

  await appendLog(paths.logFile, "compile", [
    `rawTotal: ${rawFiles.length}`,
    `wikiUpdated: ${updated.length}`,
    `languageSetting: ${cfg.compile.language || "中文"}`,
    ...(updated.length ? updated.map((p) => `wiki: ${p.file} (lang: ${p.language})`) : []),
    ...(errors.length ? ["status: error", ...errors.map((x) => `error: ${x}`)] : ["status: ok"])
  ]);

  return { updated: updated.map(u => u.file), errors };
}
