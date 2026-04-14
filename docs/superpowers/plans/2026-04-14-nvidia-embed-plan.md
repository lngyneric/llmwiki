# LLM Wiki NVIDIA Embeddings Support Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the embedding payload logic to support specific models like `nvidia/nv-embed-v1`, which might have different input requirements or smaller context windows, and ensure proper fallback when encountering 500 errors.

**Architecture:** 
1. The `nvidia/nv-embed-v1` model might require inputs to be wrapped differently, or it might be extremely sensitive to token lengths (often 512 or 1024 tokens max). We will add a truncation step to roughly 1500 characters (approx 500-700 tokens) to ensure it fits safely within the context window of such models.
2. We will also add a `input_type` parameter if the provider is identified as needing it (though standard OpenAI compatibility usually just needs `input`).
3. To avoid failing the entire pipeline, we will ensure that 500 errors are caught and logged gracefully.

**Tech Stack:** TypeScript, Node.js

---

### Task 1: Adjust Embedding Input Length and Error Handling

**Files:**
- Modify: `src/pipelines/compilePipeline.ts`

- [ ] **Step 1: Reduce slice limit to 1500 characters**
Modify `src/pipelines/compilePipeline.ts` to slice the content even further. `nvidia/nv-embed-v1` typically has a max context of 512 or 4096 tokens, but smaller slices are safer for generic embedding.

```typescript
// Replace:
// const contentForEmbedding = wikiContent.slice(0, 4000);
// With:
const contentForEmbedding = wikiContent.slice(0, 1500); // ~500 tokens, safe for most open-source models
```

```typescript
// Replace:
// const contentForEmbedding = finalContent.slice(0, 4000);
// With:
const contentForEmbedding = finalContent.slice(0, 1500);
```

- [ ] **Step 2: Add specific fallback type to provider**
If using OpenAI compatible endpoints for models like `nvidia/nv-embed-v1`, sometimes the endpoint expects the input to be a string rather than an array if it's a single item, or requires `encoding_format: "float"`.

Modify `src/provider/volcengine.ts` in `generateEmbeddings`:

```typescript
    const resp = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.model,
        input: texts,
        encoding_format: "float" // Ensure compatibility with OpenAI standard
      })
    });
```

- [ ] **Step 3: Commit**
```bash
git add src/pipelines/compilePipeline.ts src/provider/volcengine.ts
git commit -m "fix: adjust embedding payload and truncation for nvidia/nv-embed-v1 compatibility"
```

### Task 2: Rebuild

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
git commit -am "chore: rebuild with embedding fixes"
```