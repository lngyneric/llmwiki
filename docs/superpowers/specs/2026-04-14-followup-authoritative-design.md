# LLM Wiki Plugin Enhancement Spec: Follow-up & Authoritative Answers

Date: 2026-04-14
Status: Draft (Pending User Review)

## 1. Background & Goals
Users need the ability to iteratively refine answers (Follow-up / 追问) and elevate high-quality, synthesized answers into a maintained, authoritative state (Authoritative Mark / 权威标记).

### 1.1 Core Objectives
1. **Follow-up (追问)**: Allow users to ask follow-up questions on an existing generated answer. The new question and answer should be appended to the same file.
2. **Authoritative Mark (权威标记)**: Allow users to mark a generated answer as "Authoritative". It will be moved to a dedicated folder and automatically updated whenever its underlying source documents change.

## 2. Feature 1: Follow-up on Current Output (追问)

### 2.1 User Flow
1. User opens a generated file in `outputs/` (or `wiki/authoritative/`).
2. User runs command `LLM Wiki: Follow-up`.
3. A modal appears asking for the follow-up question.
4. The plugin reads the current file's content (previous Q&A) and uses it as conversational context.
5. The plugin runs a semantic search on the new question to fetch any additional context from the wiki.
6. The LLM generates the new answer.
7. The plugin appends the new question and answer to the bottom of the current file.

### 2.2 Implementation Details
- **Command**: `llm-wiki-followup`
- **Context Construction**: 
  - `History`: The text of the active file.
  - `New Context`: Top K wiki pages retrieved via vector search for the new question.
- **Prompt**: "Here is the conversation history so far. Here is additional background context. Please answer the user's new question."

## 3. Feature 2: Authoritative Mark & Auto-Update (权威标记)

### 3.1 User Flow: Marking as Authoritative
1. User reads a great answer in `outputs/`.
2. User runs command `LLM Wiki: Mark as Authoritative`.
3. The plugin parses the file to find all `[[wiki/sources/...]]` citations.
4. The plugin moves the file to `wiki/authoritative/[Filename].md`.
5. It injects YAML frontmatter:
   ```yaml
   ---
   authoritative: true
   sources:
     - wiki/sources/doc1.md
     - wiki/sources/doc2.md
   last_updated: 2026-04-14T12:00:00Z
   ---
   ```

### 3.2 User Flow: Auto-Updating
1. User runs `LLM Wiki: Compile Wiki` (or it runs automatically).
2. After standard raw-to-wiki compilation, the `compilePipeline` scans `wiki/authoritative/`.
3. For each authoritative file, it compares its `last_updated` timestamp against the `lastCompiledAt` timestamp of its `sources` in `.llm-wiki/index.json`.
4. If any source is newer than the authoritative file, an update is triggered.
5. **Update Prompt**: The LLM is provided the authoritative file's original questions/history and the *newly updated* source texts. It is asked to revise the authoritative answer to reflect the latest facts, adding an `Evolution Log` if necessary.
6. The file is overwritten with the updated content and a new `last_updated` timestamp.

## 4. Required Code Changes
1. `obsidian-plugin/src/main.ts`: 
   - Add `LLM Wiki: Follow-up` command (requires getting active file content).
   - Add `LLM Wiki: Mark as Authoritative` command (file moving, parsing `[[...]]`, injecting YAML).
2. `src/pipelines/queryPipeline.ts`: Add an exported function `followUpPipeline` that takes `history`, `newQuestion`, and `filePath` to append to.
3. `src/pipelines/compilePipeline.ts`: Add a post-processing step to scan `wiki/authoritative/`, check timestamps, and trigger `updateAuthoritativeFile`.
4. `src/templates/defaultPrompts.ts`: Add `followUpSystemPrompt` and `authoritativeUpdatePrompt`.
