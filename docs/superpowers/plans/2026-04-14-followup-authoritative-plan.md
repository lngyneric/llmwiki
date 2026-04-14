# LLM Wiki Follow-up and Authoritative Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Follow-up (追问) command for iterative questioning and the Authoritative Mark (权威标记) command with an auto-update mechanism during compile.

**Architecture:**
1. **Follow-up Pipeline**: Extends the query system. Reads an existing output file to use as conversational context, searches for additional context via embeddings, asks the LLM, and appends the result.
2. **Authoritative Mark**: A command that parses `[[wiki/sources/...]]` citations in the active file, moves it to `wiki/authoritative/`, and injects YAML frontmatter.
3. **Auto-Update**: Modifies `compilePipeline` to scan `wiki/authoritative/`. If any cited source's `lastCompiledAt` is newer than the authoritative file's `last_updated`, it triggers an LLM update prompt to refresh the authoritative file.

**Tech Stack:** TypeScript, Node.js, Obsidian API

---

### Task 1: Prompts and Pipeline for Follow-up

**Files:**
- Modify: `src/templates/defaultPrompts.ts`
- Modify: `src/pipelines/queryPipeline.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add Follow-up Prompts**
Modify `src/templates/defaultPrompts.ts`:
```typescript
export const followUpSystemPrompt = `
你是一个个人知识库（Wiki）的深度合成引擎。用户正在就之前的一个问答记录进行追问。
你的任务是根据“之前的对话历史”和“新检索到的补充资料”，回答用户的新问题。

核心纪律要求：
1. **严格溯源**：你的每一个核心结论或重要事实，都必须在句末使用 Obsidian 双向链接格式引用对应的来源文件，例如： \`（来源：[[wiki/sources/xxxx]]）\`。
2. **纯净输出**：直接输出对新问题的回答，格式为 Markdown。
`.trim();

export const followUpUserPrompt = (history: string, newContext: string, newQuestion: string) => `
【之前的对话历史】：
${history}

【新检索到的补充资料】：
${newContext}

【用户的新问题】：
${newQuestion}

请根据历史对话和新资料回答用户的新问题。
`.trim();
```

- [ ] **Step 2: Implement `followUpPipeline`**
Modify `src/pipelines/queryPipeline.ts` to add `followUpPipeline`:
```typescript
import { followUpSystemPrompt, followUpUserPrompt } from "../templates/defaultPrompts.js";

export async function followUpPipeline(opts: { root?: string; question: string; historyFilePath: string; fetcher?: typeof fetch }) {
  const root = opts.root ?? process.cwd();
  const paths = getProjectPaths(root);
  const cfg = await loadConfig(root);

  const historyAbsPath = path.resolve(root, opts.historyFilePath);
  let historyText = "";
  if (await fileExists(historyAbsPath)) {
    historyText = await fs.readFile(historyAbsPath, "utf-8");
  } else {
    throw new Error("History file not found.");
  }

  const wikiDir = path.resolve(root, cfg.paths.wikiDir);
  const hasWiki = await fileExists(wikiDir);
  const wikiFiles = hasWiki ? await globby(["**/*.md"], { cwd: wikiDir, absolute: true }) : [];

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

  const embeddingsFile = path.join(paths.stateDir, "embeddings.json");
  const embeddingsState = await loadEmbeddings(embeddingsFile);

  const scored: Array<{ file: string; score: number; excerpt: string }> = [];
  let questionVector: number[] | null = null;

  if (embedProvider) {
    try {
      const vectors = await embedProvider.generateEmbeddings([opts.question]);
      if (vectors && vectors.length > 0) {
        questionVector = vectors[0];
      }
    } catch (e) {
      console.error("Failed to embed question, falling back to keyword search", e);
    }
  }

  for (const f of wikiFiles) {
    const text = await fs.readFile(f, "utf-8");
    const relPath = path.relative(root, f).replace(/\\/g, "/");
    let score = 0;

    if (questionVector && embeddingsState[relPath]) {
      score = cosineSimilarity(questionVector, embeddingsState[relPath].vector);
      if (score > 0.5) {
        scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
      }
    } else {
      const qTokens = opts.question.split(/\s+/).filter(Boolean);
      const lower = text.toLowerCase();
      for (const t of qTokens) score += lower.includes(t.toLowerCase()) ? 1 : 0;
      if (score > 0) scored.push({ file: f, score, excerpt: text.slice(0, 1200) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, cfg.query.topK);
  const newContext =
    top.length === 0
      ? "（未找到新的补充资料。）"
      : top
          .map((x) => `## ${path.relative(root, x.file)}\n\n${x.excerpt}`)
          .join("\n\n---\n\n");

  const out = await textProvider.generateText({
    system: followUpSystemPrompt,
    prompt: followUpUserPrompt(historyText, newContext, opts.question)
  });

  const appendText = `\n\n---\n\n## 追问：${opts.question}\n\n${out.text.trim()}`;
  await writeFileAtomic(historyAbsPath, historyText + appendText);

  return { outputRel: opts.historyFilePath };
}
```

- [ ] **Step 3: Export `followUpPipeline`**
Modify `src/index.ts`:
```typescript
export { followUpPipeline } from "./pipelines/queryPipeline.js";
```

- [ ] **Step 4: Commit**
```bash
git add src/templates/defaultPrompts.ts src/pipelines/queryPipeline.ts src/index.ts
git commit -m "feat: implement followup pipeline and prompts"
```

### Task 2: Obsidian Follow-up Command

**Files:**
- Modify: `obsidian-plugin/src/main.ts`

- [ ] **Step 1: Add command in `onload`**
Modify `obsidian-plugin/src/main.ts`:
```typescript
import { followUpPipeline } from "llm-wiki";

// In onload():
    this.addCommand({
      id: "llm-wiki-followup",
      name: "Follow-up on Current File (追问)",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && (activeFile.path.startsWith("outputs/") || activeFile.path.startsWith("wiki/authoritative/"))) {
          if (!checking) {
            new QueryModal(this.app, (query) => {
              this.followUpWiki(query, activeFile.path);
            }).open();
          }
          return true;
        }
        return false;
      }
    });
```

- [ ] **Step 2: Add `followUpWiki` method**
```typescript
  async followUpWiki(query: string, filePath: string) {
    try {
      new Notice("Generating follow-up answer...");
      const root = this.getVaultBasePath();
      this.ensureConfig();

      const originalCwd = process.cwd();
      process.chdir(root);
      
      await followUpPipeline({ root, question: query, historyFilePath: filePath, fetcher: obsidianFetch });
      
      process.chdir(originalCwd);
      new Notice("Follow-up complete.");
    } catch (e: any) {
      console.error(e);
      new Notice("Error during follow-up: " + e.message);
    }
  }
```

- [ ] **Step 3: Commit**
```bash
git add obsidian-plugin/src/main.ts
git commit -m "feat(obsidian): add follow-up command"
```

### Task 3: Authoritative Mark Command

**Files:**
- Modify: `obsidian-plugin/src/main.ts`

- [ ] **Step 1: Add Mark Authoritative command**
Modify `obsidian-plugin/src/main.ts`:
```typescript
// In onload():
    this.addCommand({
      id: "llm-wiki-mark-authoritative",
      name: "Mark as Authoritative (权威标记)",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.path.startsWith("outputs/")) {
          if (!checking) {
            this.markAuthoritative(activeFile);
          }
          return true;
        }
        return false;
      }
    });
```

- [ ] **Step 2: Implement `markAuthoritative`**
```typescript
  async markAuthoritative(file: any) {
    try {
      const content = await this.app.vault.read(file);
      // Regex to find [[wiki/sources/...]] or similar
      const sourceRegex = /\[\[(wiki\/sources\/[^\]]+)\]\]/g;
      const sources = new Set<string>();
      let match;
      while ((match = sourceRegex.exec(content)) !== null) {
        sources.add(match[1]);
      }

      const sourcesList = Array.from(sources).map(s => `  - ${s}`).join("\n");
      const timestamp = new Date().toISOString();
      const yaml = `---\nauthoritative: true\nlast_updated: ${timestamp}\nsources:\n${sourcesList}\n---\n\n`;

      const newContent = yaml + content;
      
      const newFileName = file.name;
      const newFolderPath = "wiki/authoritative";
      const newPath = `${newFolderPath}/${newFileName}`;

      const adapter = this.app.vault.adapter;
      if (!(await adapter.exists(newFolderPath))) {
        await adapter.mkdir(newFolderPath);
      }

      await this.app.vault.modify(file, newContent);
      await this.app.fileManager.renameFile(file, newPath);
      
      new Notice("Marked as Authoritative and moved to wiki/authoritative");
    } catch (e: any) {
      console.error(e);
      new Notice("Error marking authoritative: " + e.message);
    }
  }
```

- [ ] **Step 3: Commit**
```bash
git add obsidian-plugin/src/main.ts
git commit -m "feat(obsidian): add mark authoritative command"
```

### Task 4: Auto-Update Authoritative Files on Compile

**Files:**
- Modify: `src/templates/defaultPrompts.ts`
- Modify: `src/pipelines/compilePipeline.ts`

- [ ] **Step 1: Add Authoritative Update Prompt**
Modify `src/templates/defaultPrompts.ts`:
```typescript
export const authoritativeUpdateSystemPrompt = `
你是一个知识库的权威文档维护专家。该文档是由多个来源合成的“权威标记”答案。
现在，该文档的部分来源资料已经更新。
你的任务是：
1. 仔细阅读“现有的权威文档”以及“已更新的来源资料”。
2. 将新的、修正的事实合并到权威文档中。
3. 在文档末尾追加 \`## Evolution Log\`（如果已有则追加条目），记录本次由于资料更新而修正了哪些核心结论。
4. 保持严格溯源格式 \`（来源：[[wiki/sources/xxxx]]）\`。
5. 纯净输出完整 Markdown。
`.trim();

export const authoritativeUpdateUserPrompt = (existingDoc: string, newSources: string) => `
【现有的权威文档】：
${existingDoc}

【已更新的来源资料】：
${newSources}

请基于已更新的来源资料，全面修正并输出最新的权威文档 Markdown：
`.trim();
```

- [ ] **Step 2: Add auto-update logic to `compilePipeline.ts`**
In `src/pipelines/compilePipeline.ts`, after the `for (const f of rawFiles)` loop and before `return`:

```typescript
import { authoritativeUpdateSystemPrompt, authoritativeUpdateUserPrompt } from "../templates/defaultPrompts.js";

// Inside compilePipeline, before saving index and logs:
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
        // Map wiki/sources/xxxx.md back to raw key to check index
        const rawKeyMatch = Object.keys(index.raw).find(k => {
          const expectedWiki = wikiPathForRaw(root, cfg.paths.rawDir, cfg.paths.wikiDir, path.join(root, cfg.paths.rawDir, k));
          const expectedRel = path.relative(root, expectedWiki).replace(/\\/g, "/");
          return expectedRel === src;
        });

        if (rawKeyMatch && index.raw[rawKeyMatch]) {
          const compiledAt = new Date(index.raw[rawKeyMatch].lastCompiledAt);
          if (compiledAt > lastUpdatedDate) {
            needsUpdate = true;
          }
        }
        
        // Load source content anyway in case we need to update
        const srcAbs = path.resolve(root, src);
        if (await fileExists(srcAbs)) {
          const srcText = await fs.readFile(srcAbs, "utf-8");
          newSourceContents.push(`### 来源：[[${src}]]\n${srcText}`);
        }
      }

      if (needsUpdate) {
        console.log("Auto-updating authoritative file:", af);
        try {
          const out = await textProvider.generateText({
            system: authoritativeUpdateSystemPrompt,
            prompt: authoritativeUpdateUserPrompt(content, newSourceContents.join("\n\n"))
          });
          
          const newTimestamp = new Date().toISOString();
          let newYamlStr = yamlStr.replace(/last_updated:\s*[^\n]+/, `last_updated: ${newTimestamp}`);
          const newContent = out.text.trim();
          
          // Ensure new content doesn't duplicate the yaml if the LLM outputted it
          let finalContent = newContent;
          if (finalContent.startsWith("---")) {
             finalContent = finalContent.replace(/^---[\s\S]*?---\n/, "");
          }
          
          await writeFileAtomic(af, `---\n${newYamlStr}\n---\n\n${finalContent}`);
          updated.push(path.relative(root, af).replace(/\\/g, "/"));
        } catch (e: any) {
          console.error("Failed to update authoritative file:", af, e.message);
          errors.push(`Authoritative update failed for ${af}: ${e.message}`);
        }
      }
    }
  }
```

- [ ] **Step 3: Commit**
```bash
git add src/templates/defaultPrompts.ts src/pipelines/compilePipeline.ts
git commit -m "feat: implement authoritative file auto-update mechanism"
```

### Task 5: Build and Verify Plugin

**Files:**
- Modify: `obsidian-plugin/main.js` (via build)

- [ ] **Step 1: Rebuild the CLI**
Run `npm run build` in the project root.

- [ ] **Step 2: Rebuild the Plugin**
Run `cd obsidian-plugin && npm run build`.

- [ ] **Step 3: Copy to test vault**
Run the Node copy script to deploy to `/Users/cherrych/Documents/Mynotes/Mynotes/.obsidian/plugins/obsidian-llmwiki-plugin`.

- [ ] **Step 4: Commit**
```bash
git commit -am "chore: build and release followup and authoritative features"
```