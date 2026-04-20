import { Plugin, Notice, FileSystemAdapter, requestUrl, WorkspaceLeaf } from "obsidian";
import { LLMWikiSettings, DEFAULT_SETTINGS, LLMWikiSettingTab } from "./settings";
import { QueryModal } from "./QueryModal";
import * as path from "node:path";
import * as fs from "node:fs";

// Import from the local package
import {
  compilePipeline,
  queryPipeline,
  followUpPipeline,
  initCommand,
  renderSchemaDiffMarkdown,
  parseSchemaMarkdown,
  diffSchemaAgainstProject,
  testTextModel,
  testEmbeddingModel
} from "llm-wiki";
import { LLMWIKI_PANEL_VIEW_TYPE, LLMWikiPanelView } from "./views/LLMWikiPanelView";

// Adapter to make Obsidian's requestUrl act like fetch
const obsidianFetch = async (url: any, options: any) => {
  const reqUrl = typeof url === "string" ? url : url.toString();
  const res = await requestUrl({
    url: reqUrl,
    method: options?.method || "GET",
    headers: options?.headers,
    body: options?.body,
    throw: false
  });
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    statusText: "",
    text: async () => res.text,
    json: async () => res.json
  } as any;
};

export default class LLMWikiPlugin extends Plugin {
  settings: LLMWikiSettings;
  schemaDiffText: string | null = null;

  async refreshSchemaDiff() {
    try {
      const root = this.getVaultBasePath();
      const schemaPath = path.join(root, "SCHEMA.md");
      if (!fs.existsSync(schemaPath)) {
        this.schemaDiffText = "SCHEMA.md not found in vault root.";
        new Notice("SCHEMA.md not found in vault root.");
        return;
      }
      const md = fs.readFileSync(schemaPath, "utf-8");
      const parsed = parseSchemaMarkdown(md);
      const diff = diffSchemaAgainstProject(parsed, root);
      this.schemaDiffText = renderSchemaDiffMarkdown(diff);
    } catch (e: any) {
      console.error(e);
      this.schemaDiffText = "Error reading schema diff.";
    }
  }

  getQuickActions(): string[] {
    return this.settings.quickActions ?? ["init", "compile", "query", "followup", "status"];
  }

  getActionLabel(id: string): string {
    switch (id) {
      case "init":
        return "Init";
      case "compile":
        return "Compile";
      case "query":
        return "Query";
      case "followup":
        return "Follow-up";
      case "authoritative":
        return "Mark Authoritative";
      case "status":
        return "Status";
      case "schema":
        return "Schema Diff";
      default:
        return id;
    }
  }

  runAction(id: string) {
    if (id === "init") this.initWiki();
    else if (id === "compile") this.compileWiki();
    else if (id === "query") {
      new QueryModal(this.app, (query) => {
        this.queryWiki(query);
      }).open();
    } else if (id === "followup") {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && (activeFile.path.startsWith("outputs/") || activeFile.path.startsWith("wiki/authoritative/"))) {
        new QueryModal(this.app, (query) => {
          this.followUpWiki(query, activeFile.path);
        }).open();
      } else {
        new Notice("Follow-up requires an outputs/ or wiki/authoritative/ file.");
      }
    } else if (id === "authoritative") {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.path.startsWith("outputs/")) {
        this.markAuthoritative(activeFile);
      } else {
        new Notice("Mark Authoritative requires an outputs/ file.");
      }
    } else if (id === "status") this.showStatus();
    else if (id === "schema") {
      this.refreshSchemaDiff();
      new Notice("Schema diff refreshed.");
    }
  }

  onSettingsChanged() {
    const leaves = this.app.workspace.getLeavesOfType(LLMWIKI_PANEL_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as LLMWikiPanelView;
      view.render();
    }
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LLMWikiSettingTab(this.app, this));

    this.registerView(
      LLMWIKI_PANEL_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new LLMWikiPanelView(leaf, this)
    );

    this.addRibbonIcon("bot", "LLM Wiki", () => {
      this.activatePanelView();
    });

    this.addCommand({
      id: "llm-wiki-init",
      name: "Initialize Wiki",
      callback: () => this.initWiki(),
    });

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

    this.addCommand({
      id: "llm-wiki-status",
      name: "Status",
      callback: () => this.showStatus(),
    });

    await this.refreshSchemaDiff();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activatePanelView() {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: LLMWIKI_PANEL_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private getVaultBasePath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    throw new Error("Only supported on desktop (FileSystemAdapter).");
  }

  private ensureConfig() {
    const root = this.getVaultBasePath();
    const configPath = path.join(root, "config", "llm-wiki.config.json");
    
    const configData = {
      paths: {
        rawDir: this.settings.rawPath,
        wikiDir: "wiki",
        outputsDir: "outputs"
      },
      provider: {
        type: this.settings.providerType,
        model: this.settings.modelName,
        baseUrl: this.settings.baseUrl,
        apiKey: this.settings.apiKey,
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens
      },
      embedding: {
        enabled: this.settings.enableEmbedding,
        type: this.settings.embedProviderType,
        model: this.settings.embedModelName,
        baseUrl: this.settings.embedBaseUrl || this.settings.baseUrl,
        apiKey: this.settings.embedApiKey || this.settings.apiKey
      },
      compile: {
        concurrency: 2,
        language: this.settings.outputLanguage
      },
      query: {
        topK: 8
      }
    };

    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(path.join(root, "config"), { recursive: true });
    }
    
    // Always overwrite config with latest settings from Obsidian UI
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  }

  async initWiki() {
    try {
      new Notice("Initializing LLM Wiki...");
      const root = this.getVaultBasePath();
      this.ensureConfig();
      
      const originalCwd = process.cwd();
      process.chdir(root);
      
      await initCommand({ root, model: this.settings.modelName });
      
      process.chdir(originalCwd);
      new Notice("LLM Wiki initialized successfully!");
    } catch (e: any) {
      console.error(e);
      new Notice("Error initializing wiki: " + e.message);
    }
  }

  async compileWiki() {
    try {
      new Notice("Compiling LLM Wiki...");
      const root = this.getVaultBasePath();
      this.ensureConfig();
      
      const originalCwd = process.cwd();
      process.chdir(root);
      
      const res = await compilePipeline({ root, fetcher: obsidianFetch });
      
      process.chdir(originalCwd);
      if (res.errors && res.errors.length > 0) {
        new Notice(`LLM Wiki compiled with ${res.errors.length} errors. Check wiki/log.md for details.`);
      } else {
        new Notice("LLM Wiki compiled successfully!");
      }
    } catch (e: any) {
      console.error(e);
      new Notice("Error compiling wiki: " + e.message);
    }
  }

  async queryWiki(query: string) {
    try {
      new Notice("Querying LLM Wiki...");
      const root = this.getVaultBasePath();
      this.ensureConfig();

      const originalCwd = process.cwd();
      process.chdir(root);
      
      const { outputRel } = await queryPipeline({ root, question: query, fetcher: obsidianFetch });
      
      process.chdir(originalCwd);
      new Notice("Query complete.");
      
      // Open the new file
      await this.app.workspace.openLinkText(outputRel, "", true);
    } catch (e: any) {
      console.error(e);
      new Notice("Error querying wiki: " + e.message);
    }
  }

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

  async markAuthoritative(file: any) {
    try {
      const content = await this.app.vault.read(file);
      const sourceRegex = /\[\[(wiki\/(?:summaries|sources)\/[^\]]+)\]\]/g;
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

  async showStatus() {
    try {
      const root = this.getVaultBasePath();
      const indexPath = path.join(root, ".llm-wiki", "index.json");
      const logPath = path.join(root, "wiki", "log.md");
      
      let statusMsg = "LLM Wiki Status:\n";

      if (fs.existsSync(indexPath)) {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        const rawFiles = Object.keys(index.raw || {});
        const totalCount = rawFiles.length;
        
        let successCount = 0;
        let errorCount = 0;
        
        rawFiles.forEach(key => {
          if (index.raw[key].status === "ok") {
            successCount++;
          } else if (index.raw[key].status === "error") {
            errorCount++;
          }
        });
        
        statusMsg += `- 总文件数 (Total): ${totalCount}\n`;
        statusMsg += `- 编译成功 (Success): ${successCount}\n`;
        statusMsg += `- 编译失败 (Error): ${errorCount}\n`;
        
        if (errorCount > 0) {
          statusMsg += `\n(请查看 wiki/log.md 获取详细报错信息)`;
        }
      } else {
        statusMsg = "LLM Wiki not initialized or no index found.";
      }
      
      new Notice(statusMsg, 10000); // 显示 10 秒
      
      // 如果文件存在，同时打开 log.md 方便用户查看具体进度和报错
      if (fs.existsSync(logPath)) {
        await this.app.workspace.openLinkText("wiki/log.md", "", true);
      }
    } catch (e) {
      new Notice("Error reading status.");
    }
  }

  async testTextModel() {
    try {
      const result = await testTextModel({
        baseUrl: this.settings.baseUrl,
        apiKey: this.settings.apiKey,
        model: this.settings.modelName,
        fetcher: obsidianFetch as any
      });
      new Notice("Text model test success.");
    } catch (e: any) {
      console.error(e);
      new Notice("Text model test failed: " + e.message);
    }
  }

  async testEmbeddingModel() {
    try {
      if (!this.settings.enableEmbedding) {
        new Notice("Embedding is disabled.");
        return;
      }
      const baseUrl = this.settings.embedBaseUrl || this.settings.baseUrl;
      const apiKey = this.settings.embedApiKey || this.settings.apiKey;
      const result = await testEmbeddingModel({
        baseUrl,
        apiKey,
        model: this.settings.embedModelName,
        fetcher: obsidianFetch as any
      });
      new Notice("Embedding model test success.");
    } catch (e: any) {
      console.error(e);
      new Notice("Embedding model test failed: " + e.message);
    }
  }
}
