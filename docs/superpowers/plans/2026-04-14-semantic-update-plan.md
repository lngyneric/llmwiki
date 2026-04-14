# LLM Wiki Semantic Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement true semantic search (LLM embeddings) and an intelligent wiki update mechanism (LLM Merge) in the LLM Wiki plugin.

**Architecture:** 
1. `VolcengineProvider` will be extended to support an `generateEmbeddings` endpoint. 
2. `compilePipeline` will check for existing wiki files. If found, it uses a new "Update/Merge" prompt. After a successful generation, it requests an embedding vector for the wiki file and saves it to `.llm-wiki/embeddings.json`.
3. `queryPipeline` will embed the user's question, calculate cosine similarity against stored vectors, pick the top matches, and pass them to the LLM for the final answer.

**Tech Stack:** TypeScript, Node.js

---

### Task 1: Update Prompts for "Merge and Update"

**Files:**
- Modify: `src/templates/defaultPrompts.ts`

- [ ] **Step 1: Add update prompts**
Modify `src/templates/defaultPrompts.ts` to include `updateSystemPrompt` and `updateUserPrompt`.

```typescript
// Add to src/templates/defaultPrompts.ts

export const updateSystemPrompt = `
你是一个知识库（Wiki）维护助手。你的任务是根据“现有的 Wiki 页面”和“更新后的原始素材”，智能地合并和更新 Wiki 页面。
请遵循以下原则：
1. 保持原有 Wiki 页面的结构（如摘要、关键要点、证据片段等）。
2. 将新素材中新增的、有价值的信息融合进去。
3. 如果新素材与现有 Wiki 的内容存在矛盾，请务必使用冲突标注格式：
> [!WARNING] 冲突：<冲突点一句话>
> - 观点 A：...（来源：旧版 Wiki）
> - 观点 B：...（来源：新素材）
> - 现状：暂不裁决
4. 输出的纯 Markdown 文本不应包含额外的对话或解释。
`.trim();

export function updateUserPrompt(relKey: string, existingWiki: string, newRawText: string) {
  return `
源文件更新路径：${relKey}

【现有的 Wiki 页面内容】：
${existingWiki}

【更新后的原始素材内容】：
${newRawText}

请输出更新合并后的完整 Wiki 页面 Markdown：
`.trim();
}
```

- [ ] **Step 2: Commit**
```bash
git add src/templates/defaultPrompts.ts
git commit -m "feat: add prompts for wiki merge update mechanism"
```

### Task 2: Implement Provider Embeddings

**Files:**
- Modify: `src/provider/provider.ts`
- Modify: `src/provider/volcengine.ts`
- Modify: `obsidian-plugin/src/settings.ts`
- Modify: `obsidian-plugin/src/main.ts`

- [ ] **Step 1: Extend `LlmProvider` interface**
Modify `src/provider/provider.ts`:

```typescript
export type GenerateTextInput = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateTextOutput = {
  text: string;
  raw?: unknown;
};

export interface LlmProvider {
  name: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  generateEmbeddings?(texts: string[]): Promise<number[][]>;
}
```

- [ ] **Step 2: Implement `generateEmbeddings` in Volcengine**
Modify `src/provider/volcengine.ts`. The Volcengine/OpenAI embeddings API endpoint is `/embeddings`.

```typescript
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const baseUrl =
      this.cfg.baseUrl ?? process.env.VOLC_BASE_URL ?? process.env.ARK_BASE_URL ?? "";
    const apiKey = process.env.VOLC_API_KEY ?? process.env.ARK_API_KEY ?? "";
    if (!baseUrl || !apiKey) {
      throw new Error("Missing VOLC_BASE_URL or VOLC_API_KEY");
    }

    const normalizedBase = baseUrl.replace(/\/$/, "");
    const endpoint = /\/v3$/.test(normalizedBase)
      ? `${normalizedBase}/embeddings`
      : `${normalizedBase}/v1/embeddings`;

    const fetchFn = this.cfg.fetcher || globalThis.fetch;
    const resp = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.embedModelName || "ep-20240521-embed-xxx", // Or however they named it
        input: texts
      })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Embeddings request failed: ${resp.status} ${resp.statusText} ${text}`);
    }

    const json: any = await resp.json();
    if (!json?.data || !Array.isArray(json.data)) {
      throw new Error("Unexpected Embeddings response shape");
    }

    // Sort by index just in case
    json.data.sort((a: any, b: any) => a.index - b.index);
    return json.data.map((item: any) => item.embedding);
  }
```
*Also update constructor signature to accept `embedModelName?: string`*.

- [ ] **Step 3: Add `embedModelName` to Plugin Settings**
Modify `obsidian-plugin/src/settings.ts`:
Add `embedModelName: string` to `LLMWikiSettings`. Add default `"ep-20240521-embed-xxx"`.
Add a text input in `display()` for "Embedding Model Name".

- [ ] **Step 4: Inject setting into Config in `main.ts`**
Modify `ensureConfig` in `obsidian-plugin/src/main.ts` to include `embedModelName: this.settings.embedModelName` under `provider`.

- [ ] **Step 5: Commit**
```bash
git add src/provider/provider.ts src/provider/volcengine.ts obsidian-plugin/src/settings.ts obsidian-plugin/src/main.ts
git commit -m "feat: add generateEmbeddings to provider and plugin settings"
```

### Task 3: Embeddings State Management

**Files:**
- Modify: `src/core/state.ts`

- [ ] **Step 1: Add Embeddings load/save logic**
Add these functions to `src/core/state.ts` to manage the JSON vector store.

```typescript
export type EmbeddingsState = Record<string, { hash: string; vector: number[] }>;

export async function loadEmbeddings(file: string): Promise<EmbeddingsState> {
  if (!(await fileExists(file))) return {};
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveEmbeddings(file: string, state: EmbeddingsState): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(state));
}
```

- [ ] **Step 2: Commit**
```bash
git add src/core/state.ts
git commit -m "feat: add embeddings state management"
```

### Task 4: Compile Pipeline Update Mechanism & Embeddings

**Files:**
- Modify: `src/pipelines/compilePipeline.ts`

- [ ] **Step 1: Update compile logic to support LLM Merge and Vector extraction**
Modify `src/pipelines/compilePipeline.ts`.

```typescript
import { updateSystemPrompt, updateUserPrompt } from "../templates/defaultPrompts.js";
import { loadEmbeddings, saveEmbeddings } from "../core/state.js";
import { fileExists } from "../core/fs.js";

// Inside compilePipeline:
const embeddingsFile = path.join(paths.stateDir, "embeddings.json");
const embeddingsState = await loadEmbeddings(embeddingsFile);

// ... Provider initialization (pass embedModelName from cfg.provider.embedModelName) ...

// Inside the loop over rawFiles:
      const rawText = await fs.readFile(f, "utf-8");
      const wikiAbs = wikiPathForRaw(root, cfg.paths.rawDir, cfg.paths.wikiDir, f);
      const wikiRel = path.relative(root, wikiAbs).replace(/\\/g, "/");
      
      let outText = "";
      if (await fileExists(wikiAbs)) {
        // Update Mode
        const existingWiki = await fs.readFile(wikiAbs, "utf-8");
        const out = await provider.generateText({
          system: updateSystemPrompt,
          prompt: updateUserPrompt(relKey, existingWiki, rawText)
        });
        outText = out.text.trim();
      } else {
        // Create Mode
        const out = await provider.generateText({
          system: compileSystemPrompt,
          prompt: compileUserPrompt(relKey, rawText)
        });
        outText = out.text.trim();
      }

      const header = [
        "---",
        `source: ${relKey}`,
        `raw_sha256: ${sha}`,
        `compiled_at: ${new Date().toISOString()}`,
        "---",
        ""
      ].join("\n");
      
      const finalContent = header + outText + "\n";
      await writeFileAtomic(wikiAbs, finalContent);
      updated.push(wikiRel);

      // Generate embedding for the new wiki content
      if (provider.generateEmbeddings) {
        try {
          // Truncate to reasonable length to avoid token limits for embeddings
          const contentForEmbedding = finalContent.slice(0, 8000); 
          const [vector] = await provider.generateEmbeddings([contentForEmbedding]);
          const wikiSha = await sha256File(wikiAbs);
          embeddingsState[wikiRel] = { hash: wikiSha, vector };
        } catch (embErr: any) {
          console.error("Embedding generation failed for", wikiRel, embErr.message);
        }
      }

      index.raw[relKey] = { sha256: sha, lastCompiledAt: new Date().toISOString(), status: "ok" };

// ... After loop:
await saveEmbeddings(embeddingsFile, embeddingsState);
```

- [ ] **Step 2: Commit**
```bash
git add src/pipelines/compilePipeline.ts
git commit -m "feat: implement wiki merge update and vector embedding in compile pipeline"
```

### Task 5: Query Pipeline Semantic Search

**Files:**
- Modify: `src/pipelines/queryPipeline.ts`

- [ ] **Step 1: Implement Cosine Similarity and semantic search**
Modify `src/pipelines/queryPipeline.ts`.

```typescript
import { loadEmbeddings } from "../core/state.js";

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Inside queryPipeline:
  const embeddingsFile = path.join(paths.stateDir, "embeddings.json");
  const embeddingsState = await loadEmbeddings(embeddingsFile);

// Replace keyword scoring loop with vector scoring:
  const scored: Array<{ file: string; score: number; excerpt: string }> = [];
  let questionVector: number[] | null = null;

  if (provider.generateEmbeddings) {
    try {
      [questionVector] = await provider.generateEmbeddings([opts.question]);
    } catch (e) {
      console.error("Failed to embed question, falling back to keyword search", e);
    }
  }

  for (const f of wikiFiles) {
    const text = await fs.readFile(f, "utf-8");
    const relPath = path.relative(root, f).replace(/\\/g, "/");
    let score = 0;

    if (questionVector && embeddingsState[relPath]) {
      // Vector Search
      score = cosineSimilarity(questionVector, embeddingsState[relPath].vector);
      if (score > 0.5) { // Threshold
        scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
      }
    } else {
      // Fallback Keyword Search
      const qTokens = opts.question.split(/\s+/).filter(Boolean);
      const lower = text.toLowerCase();
      for (const t of qTokens) score += lower.includes(t.toLowerCase()) ? 1 : 0;
      if (score > 0) scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
    }
  }
```

- [ ] **Step 2: Rebuild & test project**
Run `npm run build` in root and `npm run build` in `obsidian-plugin`.

- [ ] **Step 3: Commit**
```bash
git add src/pipelines/queryPipeline.ts
git commit -m "feat: replace keyword search with semantic vector search in query pipeline"
```
