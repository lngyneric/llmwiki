# Obsidian LLM Wiki Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian Desktop plugin that integrates the core logic of `llmwiki-cli` to compile wikis and execute queries directly within an Obsidian vault.

**Architecture:** The plugin resides in an `obsidian-plugin/` directory within the existing `LLMWiki` repository. It imports the core pipelines (`compilePipeline`, `queryPipeline`) from the parent package. The plugin provides a Settings tab for API keys and paths, and registers commands to trigger the pipelines. Node.js `fs` and `path` are used since it is a Desktop-only plugin.

**Tech Stack:** TypeScript, Obsidian Plugin API, Node.js (`fs`, `path`), esbuild.

---

### Task 1: Refactor `llmwiki-cli` Paths and Exports

**Files:**
- Modify: `src/core/paths.ts`
- Create: `src/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Update `paths.ts` to respect config for all directories**
Modify `src/core/paths.ts` to read `rawDir` and `outputsDir` from the config file, defaulting to `"raw"` and `"outputs"` if not present.
```typescript
import path from "node:path";
import fs from "node:fs";

export type ProjectPaths = {
  root: string;
  rawDir: string;
  wikiDir: string;
  outputsDir: string;
  promptsDir: string;
  configFile: string;
  stateDir: string;
  indexFile: string;
  logFile: string;
};

export function getProjectPaths(root = process.cwd()): ProjectPaths {
  const configFile = path.join(root, "config", "llm-wiki.config.json");
  let wikiDir = path.join(root, "wiki");
  let rawDir = path.join(root, "raw");
  let outputsDir = path.join(root, "outputs");
  
  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      if (config.paths) {
        if (config.paths.wikiDir) wikiDir = path.resolve(root, config.paths.wikiDir);
        if (config.paths.rawDir) rawDir = path.resolve(root, config.paths.rawDir);
        if (config.paths.outputsDir) outputsDir = path.resolve(root, config.paths.outputsDir);
      }
    }
  } catch (e) {}

  return {
    root,
    rawDir,
    wikiDir,
    outputsDir,
    promptsDir: path.join(root, "prompts"),
    configFile,
    stateDir: path.join(root, ".llm-wiki"),
    indexFile: path.join(root, ".llm-wiki", "index.json"),
    logFile: path.join(root, "wiki", "log.md")
  };
}
```

- [ ] **Step 2: Export pipelines in `src/index.ts`**
Create `src/index.ts` to expose the core logic.
```typescript
export { initPipeline } from "./pipelines/initPipeline.js"; // Adjust based on actual exports
export { compilePipeline } from "./pipelines/compilePipeline.js";
export { queryPipeline } from "./pipelines/queryPipeline.js";
export { getProjectPaths } from "./core/paths.js";
export { getConfig } from "./core/config.js";
```

- [ ] **Step 3: Update `package.json` main export**
Add `"main": "dist/index.js"` to `package.json` so the plugin can import it.
```json
  "main": "dist/index.js",
```

- [ ] **Step 4: Build the parent project**
Run: `npm run build` in the root directory.
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/core/paths.ts src/index.ts package.json
git commit -m "refactor: export pipelines and make paths configurable for obsidian integration"
```

### Task 2: Scaffold Obsidian Plugin

**Files:**
- Create: `obsidian-plugin/package.json`
- Create: `obsidian-plugin/tsconfig.json`
- Create: `obsidian-plugin/esbuild.config.mjs`
- Create: `obsidian-plugin/manifest.json`

- [ ] **Step 1: Create `obsidian-plugin/package.json`**
```json
{
  "name": "obsidian-llmwiki-plugin",
  "version": "1.0.0",
  "description": "LLM Wiki plugin for Obsidian",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production"
  },
  "dependencies": {
    "llm-wiki": "file:../"
  },
  "devDependencies": {
    "@types/node": "^16.11.6",
    "@typescript-eslint/eslint-plugin": "5.29.0",
    "@typescript-eslint/parser": "5.29.0",
    "builtin-modules": "3.3.0",
    "esbuild": "0.17.3",
    "obsidian": "latest",
    "tslib": "2.4.0",
    "typescript": "4.7.4"
  }
}
```

- [ ] **Step 2: Create `obsidian-plugin/manifest.json`**
```json
{
  "id": "obsidian-llmwiki-plugin",
  "name": "LLM Wiki",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "Compile your vault notes into an LLM-maintained Wiki and query it directly.",
  "author": "Trae",
  "authorUrl": "",
  "isDesktopOnly": true
}
```

- [ ] **Step 3: Create `obsidian-plugin/tsconfig.json`**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create `obsidian-plugin/esbuild.config.mjs`**
```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = (process.argv[2] === "production");

const context = await esbuild.context({
  banner: {
    js: '/* eslint-disable */',
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 5: Install plugin dependencies**
Run: `cd obsidian-plugin && npm install`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add obsidian-plugin/
git commit -m "chore: scaffold obsidian plugin package"
```

### Task 3: Plugin Settings & Environment Injection

**Files:**
- Create: `obsidian-plugin/src/settings.ts`

- [ ] **Step 1: Define settings structure and UI**
```typescript
import { App, PluginSettingTab, Setting } from "obsidian";
import LLMWikiPlugin from "./main";

export interface LLMWikiSettings {
  rawPath: string;
  providerType: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export const DEFAULT_SETTINGS: LLMWikiSettings = {
  rawPath: "raw",
  providerType: "volcengine",
  apiKey: "",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  modelName: "ep-20240414-xxx",
  temperature: 0.2,
  maxTokens: 2000,
};

export class LLMWikiSettingTab extends PluginSettingTab {
  plugin: LLMWikiPlugin;

  constructor(app: App, plugin: LLMWikiPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "LLM Wiki Settings" });

    new Setting(containerEl)
      .setName("Raw Directory Path")
      .setDesc("Relative path to your raw notes folder (e.g., 'Inbox' or 'raw').")
      .addText((text) =>
        text
          .setPlaceholder("raw")
          .setValue(this.plugin.settings.rawPath)
          .onChange(async (value) => {
            this.plugin.settings.rawPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Provider Type")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("volcengine", "Volcengine (火山/字节)")
          .addOption("openai", "OpenAI / Custom")
          .setValue(this.plugin.settings.providerType)
          .onChange(async (value) => {
            this.plugin.settings.providerType = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Enter API Key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Base URL")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model Name")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.modelName)
          .onChange(async (value) => {
            this.plugin.settings.modelName = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add obsidian-plugin/src/settings.ts
git commit -m "feat(obsidian): add settings tab"
```

### Task 4: Query Modal

**Files:**
- Create: `obsidian-plugin/src/QueryModal.ts`

- [ ] **Step 1: Create the Query Modal**
```typescript
import { App, Modal, Setting } from "obsidian";

export class QueryModal extends Modal {
  result: string = "";
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Ask LLM Wiki" });

    new Setting(contentEl)
      .setName("Query")
      .addText((text) =>
        text.onChange((value) => {
          this.result = value;
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Submit")
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.result);
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add obsidian-plugin/src/QueryModal.ts
git commit -m "feat(obsidian): add query modal UI"
```

### Task 5: Plugin Main File and Commands

**Files:**
- Create: `obsidian-plugin/src/main.ts`

- [ ] **Step 1: Implement the main plugin class**
```typescript
import { Plugin, Notice, FileSystemAdapter } from "obsidian";
import { LLMWikiSettings, DEFAULT_SETTINGS, LLMWikiSettingTab } from "./settings";
import { QueryModal } from "./QueryModal";
import * as path from "node:path";
import * as fs from "node:fs";

// Import from the local package
import { compilePipeline, queryPipeline } from "llm-wiki";

export default class LLMWikiPlugin extends Plugin {
  settings: LLMWikiSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LLMWikiSettingTab(this.app, this));

    this.addCommand({
      id: "llm-wiki-compile",
      name: "Compile Wiki",
      callback: () => this.compileWiki(),
    });

    this.addCommand({
      id: "llm-wiki-query",
      name: "Query Wiki",
      callback: () => {
        new QueryModal(this.app, (query) => {
          this.queryWiki(query);
        }).open();
      },
    });

    this.addCommand({
      id: "llm-wiki-status",
      name: "Status",
      callback: () => this.showStatus(),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private getVaultBasePath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    throw new Error("Only supported on desktop (FileSystemAdapter).");
  }

  private injectEnv() {
    // Inject API keys into process.env so the llm-wiki pipelines can read them
    if (this.settings.providerType === "volcengine") {
      process.env.VOLC_API_KEY = this.settings.apiKey;
      process.env.VOLC_BASE_URL = this.settings.baseUrl;
    } else {
      process.env.OPENAI_API_KEY = this.settings.apiKey;
      process.env.OPENAI_BASE_URL = this.settings.baseUrl;
    }
  }

  private ensureConfig() {
    const root = this.getVaultBasePath();
    const configPath = path.join(root, "config", "llm-wiki.config.json");
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
      const config = {
        paths: {
          rawDir: this.settings.rawPath,
          wikiDir: "wiki",
          outputsDir: "outputs"
        },
        provider: {
          type: this.settings.providerType,
          model: this.settings.modelName,
          temperature: this.settings.temperature,
          maxTokens: this.settings.maxTokens
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } else {
      // Update config based on settings
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      config.paths = { ...config.paths, rawDir: this.settings.rawPath };
      config.provider = {
        type: this.settings.providerType,
        model: this.settings.modelName,
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  }

  async compileWiki() {
    try {
      new Notice("Compiling LLM Wiki...");
      const root = this.getVaultBasePath();
      this.ensureConfig();
      this.injectEnv();
      
      // Temporarily change process.cwd for the pipeline
      const originalCwd = process.cwd();
      process.chdir(root);
      
      await compilePipeline({});
      
      process.chdir(originalCwd);
      new Notice("LLM Wiki compiled successfully!");
    } catch (e) {
      console.error(e);
      new Notice("Error compiling wiki: " + e.message);
    }
  }

  async queryWiki(query: string) {
    try {
      new Notice("Querying LLM Wiki...");
      const root = this.getVaultBasePath();
      this.ensureConfig();
      this.injectEnv();

      const originalCwd = process.cwd();
      process.chdir(root);
      
      // queryPipeline should return the output file path or we can find the newest one
      // Assuming queryPipeline writes to outputs/
      await queryPipeline(query, {});
      
      process.chdir(originalCwd);
      new Notice("Query complete.");
      
      // Find the most recently created file in outputs/ to open it
      const outputsDir = path.join(root, "outputs");
      if (fs.existsSync(outputsDir)) {
        const files = fs.readdirSync(outputsDir)
          .map(name => ({ name, time: fs.statSync(path.join(outputsDir, name)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time);
        
        if (files.length > 0) {
          const newestFile = files[0].name;
          const obsidianPath = "outputs/" + newestFile;
          await this.app.workspace.openLinkText(obsidianPath, "", true);
        }
      }
    } catch (e) {
      console.error(e);
      new Notice("Error querying wiki: " + e.message);
    }
  }

  async showStatus() {
    try {
      const root = this.getVaultBasePath();
      const indexPath = path.join(root, ".llm-wiki", "index.json");
      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        const rawCount = Object.keys(index.raw || {}).length;
        new Notice(`LLM Wiki Status:\nIndexed raw files: ${rawCount}`);
      } else {
        new Notice("LLM Wiki not initialized or no index found.");
      }
    } catch (e) {
      new Notice("Error reading status.");
    }
  }
}
```

- [ ] **Step 2: Build the plugin**
Run: `cd obsidian-plugin && npm run build`
Expected: PASS (main.js generated)

- [ ] **Step 3: Commit**
```bash
git add obsidian-plugin/src/main.ts
git commit -m "feat(obsidian): implement main plugin commands and logic"
```
