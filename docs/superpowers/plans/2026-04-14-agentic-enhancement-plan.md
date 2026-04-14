# LLM Wiki Agentic Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the current programmatic pipeline with agentic features from the Andrej Karpathy LLM-Wiki pattern: Concept extraction, Evolution Logs, and strict Query tracing with Confidence Notes.

**Architecture:** 
1. `compilePipeline`: We will update the `compileSystemPrompt` to explicitly instruct the LLM to output its response in two distinct blocks: one for the Source Summary, and one for the extracted Concepts (as a JSON array).
2. `compilePipeline`: We will add a post-processing step that reads this JSON array, and for each concept, appends/creates a concept file in `wiki/concepts/` with an "Evolution Log" entry.
3. `queryPipeline`: We will update the `querySystemPrompt` to enforce the output format to include a `⚠ Confidence Notes` section and require explicit linking to `wiki/sources/...` files.

**Tech Stack:** TypeScript, Node.js

---

### Task 1: Update Compile Prompts for Concept Extraction

**Files:**
- Modify: `src/templates/defaultPrompts.ts`

- [ ] **Step 1: Update `compileSystemPrompt` and `updateSystemPrompt`**
Modify `src/templates/defaultPrompts.ts` to instruct the LLM to return extracted concepts in a specific `<concepts>` XML block containing JSON.

```typescript
export const compileSystemPrompt = `
你是一个知识库（Wiki）创建助手。你的任务是阅读用户提供的“原始素材”，并生成两部分内容：
1. 结构化的 Wiki 页面 Markdown（摘要、关键要点、证据片段等）。
2. 从素材中提取的核心概念（Concepts）列表，以特定的 XML 标签格式输出。

请务必按以下严格格式输出你的回答：

<wiki>
# [页面标题]
（这里是你的 Markdown 内容）
</wiki>

<concepts>
[
  {
    "name": "概念名称（如：注意力机制）",
    "description": "该概念在本素材中的核心定义或观点（1-2句话）"
  }
]
</concepts>
`.trim();

export const updateSystemPrompt = `
你是一个知识库（Wiki）维护助手。你的任务是根据“现有的 Wiki 页面”和“更新后的原始素材”，智能地合并和更新 Wiki 页面，并提取新的或变更的概念。

请遵循以下原则：
1. 保持原有 Wiki 页面的结构，将新素材中有价值的信息融合进去。
2. 如果存在矛盾，请使用冲突标注格式：> [!WARNING] 冲突：...
3. 提取核心概念列表（无论是原有的还是新增的），以特定的 XML 标签格式输出。

请务必按以下严格格式输出你的回答：

<wiki>
# [页面标题]
（这里是你的 Markdown 内容）
</wiki>

<concepts>
[
  {
    "name": "概念名称（如：注意力机制）",
    "description": "该概念在本素材中的核心定义或观点（1-2句话）"
  }
]
</concepts>
`.trim();
```

- [ ] **Step 2: Commit**
```bash
git add src/templates/defaultPrompts.ts
git commit -m "feat: add concept extraction instructions to compile prompts"
```

### Task 2: Implement Concept Extraction and Evolution Log in Compile Pipeline

**Files:**
- Modify: `src/pipelines/compilePipeline.ts`

- [ ] **Step 1: Add XML parsing logic to extract `<wiki>` and `<concepts>`**
In `src/pipelines/compilePipeline.ts`, after generating `outText`, parse the two blocks.

```typescript
      // After provider.generateText(...)
      let outText = out.text.trim();
      let wikiContent = outText;
      let concepts: Array<{name: string, description: string}> = [];

      const wikiMatch = outText.match(/<wiki>([\s\S]*?)<\/wiki>/);
      const conceptsMatch = outText.match(/<concepts>([\s\S]*?)<\/concepts>/);

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
```

- [ ] **Step 2: Add logic to process Concepts and update Evolution Logs**
After writing `wikiAbs`, process the `concepts` array to update `wiki/concepts/`.

```typescript
      // After writing finalContent to wikiAbs
      const conceptsDir = path.join(root, cfg.paths.wikiDir, "concepts");
      if (concepts.length > 0) {
        await fs.mkdir(conceptsDir, { recursive: true });
        const dateStr = new Date().toISOString().split("T")[0];
        
        for (const concept of concepts) {
          // Slugify concept name for filename
          const safeName = concept.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "");
          if (!safeName) continue;
          
          const conceptFile = path.join(conceptsDir, `${safeName}.md`);
          const logEntry = `- ${dateStr}: 来自 [[${wikiRel.replace(/\.md$/, "")}]] 的认知：${concept.description}\n`;
          
          if (await fileExists(conceptFile)) {
            // Append to existing Evolution Log
            const existingContent = await fs.readFile(conceptFile, "utf-8");
            if (existingContent.includes("## Evolution Log")) {
              const newContent = existingContent.replace("## Evolution Log\n", `## Evolution Log\n${logEntry}`);
              await writeFileAtomic(conceptFile, newContent);
            } else {
              await writeFileAtomic(conceptFile, existingContent + `\n\n## Evolution Log\n${logEntry}`);
            }
          } else {
            // Create new concept file
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
```

- [ ] **Step 3: Update `finalContent` creation to use `wikiContent` instead of `outText`**
```typescript
      const finalContent = header + wikiContent + "\n";
```

- [ ] **Step 4: Commit**
```bash
git add src/pipelines/compilePipeline.ts
git commit -m "feat: parse and generate concepts with evolution logs during compilation"
```

### Task 3: Update Query Prompts for Traceability and Confidence

**Files:**
- Modify: `src/templates/defaultPrompts.ts`

- [ ] **Step 1: Update `querySystemPrompt`**
Modify `src/templates/defaultPrompts.ts`.

```typescript
export const querySystemPrompt = `
你是一个个人知识库（Wiki）的深度合成引擎。你的任务是根据用户提供的一系列“背景资料（Context）”回答问题。

核心纪律要求：
1. **严格溯源**：你的每一个核心结论或重要事实，都必须在句末使用 Obsidian 双向链接格式引用对应的来源文件，例如： \`（来源：[[wiki/sources/xxxx]]）\`。**不允许凭空捏造知识库中没有的信息**。
2. **Confidence Notes（置信度说明）**：你必须在回答的最末尾，另起一段添加一个名为 \`## ⚠ Confidence Notes\` 的章节。
   - 如果你在背景资料中发现矛盾、信息陈旧或证据不足的情况，必须在这里列出。
   - 如果某个结论只有一个来源支撑（孤立证据），必须标记为 \`low confidence\`。
3. **纯净输出**：直接输出 Markdown，不要包含任何“好的，这是您的答案”之类的闲聊废话。
`.trim();
```

- [ ] **Step 2: Commit**
```bash
git add src/templates/defaultPrompts.ts
git commit -m "feat: enforce traceability and confidence notes in query prompt"
```

### Task 4: Build and Verify Plugin

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
git commit -am "chore: build and release agentic enhancements"
```
