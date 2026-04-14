# LLM Wiki Plugin Enhancement Spec: Semantic Search & Update Mechanism

Date: 2026-04-14
Status: Draft (Pending User Review)

## 1. Goal
Upgrade the current LLM Wiki plugin to solve two core problems:
1. **Semantic Search**: Replace the existing simple keyword-matching logic in the `query` pipeline with true semantic understanding using LLM Embeddings (Vector Search).
2. **Wiki Update Mechanism**: Instead of overwriting existing wiki pages when a raw file changes, use an LLM prompt to "Merge and Update" the existing wiki content with the new raw content.

## 2. Feature 1: Semantic Understanding (Vector Search)

### 2.1 Embedding Generation
- **Provider Interface Update**: Add a `generateEmbeddings(texts: string[]): Promise<number[][]>` method to `LlmProvider` and implement it in `VolcengineProvider` (calling the Volcengine/OpenAI embeddings endpoint).
- **Settings Update**: Add a setting for `Embedding Model Name` (e.g., `ep-20240414-embed-xxx` for Volcengine or `text-embedding-ada-002` for OpenAI) in the Obsidian settings tab.

### 2.2 Storage (`embeddings.json`)
- During the `compile` pipeline, after a wiki page is successfully generated or updated, the plugin will read the final wiki text, chunk it if necessary (MVP: one chunk per file up to token limit), and call the embedding API.
- Store the results in `.llm-wiki/embeddings.json` mapping relative wiki paths to their vectors.
  ```json
  {
    "wiki/sources/doc1.md": {
      "hash": "sha256-of-wiki-content",
      "vector": [0.12, -0.45, ...]
    }
  }
  ```

### 2.3 Query Pipeline Update
1. Embed the user's question using the embedding API.
2. Load `.llm-wiki/embeddings.json`.
3. Compute Cosine Similarity between the question vector and all wiki document vectors.
4. Pick the top K documents with the highest similarity score.
5. Feed these top documents to the LLM to generate the final answer.

## 3. Feature 2: Answer Update Mechanism (LLM Merge Update)

### 3.1 Current vs New Flow
- **Current**: If `raw/A.md` changes (hash mismatch), the system passes the new `A.md` to the LLM and overwrites `wiki/sources/A.md`.
- **New Flow**: 
  1. Check if `wiki/sources/A.md` already exists.
  2. If **No**, run the standard creation prompt.
  3. If **Yes**, read the existing `wiki/sources/A.md`.
  4. Pass BOTH the existing wiki text AND the new `raw/A.md` text to the LLM using a new **Update Prompt**.
  5. **Prompt Logic**: "Here is the existing Wiki page. Here is the updated Raw material. Please merge the new information into the Wiki page, update outdated facts, and explicitly add a Conflict block if the new material contradicts the old one."
  6. Overwrite the wiki page with the newly merged output.

### 3.2 Prompts Addition
- Add `updateSystemPrompt` and `updateUserPrompt(existingWiki, newRaw)` in `src/templates/defaultPrompts.ts`.

## 4. Required Changes

1. `src/provider/provider.ts`: Add `generateEmbeddings`.
2. `src/provider/volcengine.ts`: Implement `/embeddings` API call.
3. `obsidian-plugin/src/settings.ts` & `main.ts`: Add `embedModelName` to config and UI.
4. `src/templates/defaultPrompts.ts`: Add update-specific prompts.
5. `src/pipelines/compilePipeline.ts`: 
   - Add logic to read existing wiki files and choose between Create/Update prompt.
   - Add logic to generate and save vectors to `embeddings.json` after a successful compile.
6. `src/pipelines/queryPipeline.ts`:
   - Replace string-matching loop with embedding API call + cosine similarity math.
