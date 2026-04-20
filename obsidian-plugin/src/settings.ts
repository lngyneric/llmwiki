import { App, PluginSettingTab, Setting } from "obsidian";
import LLMWikiPlugin from "./main";

export interface LLMWikiSettings {
  rawPath: string;
  // Generation Model
  providerType: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  // Embedding Model
  enableEmbedding: boolean;
  embedProviderType: string;
  embedApiKey: string;
  embedBaseUrl: string;
  embedModelName: string;
  // Compilation
  outputLanguage: string;
  quickActions: string[];
}

export const DEFAULT_SETTINGS: LLMWikiSettings = {
  rawPath: "raw",
  providerType: "volcengine",
  apiKey: "",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  modelName: "ep-20240414-xxx",
  temperature: 0.2,
  maxTokens: 2000,
  enableEmbedding: true,
  embedProviderType: "volcengine",
  embedApiKey: "",
  embedBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  embedModelName: "ep-20240521-embed-xxx",
  outputLanguage: "中文",
  quickActions: ["init", "compile", "query", "followup", "status"],
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
      .setName("Output Language (Compilation)")
      .setDesc("The language to use when compiling raw notes into Wiki pages. 'Original' means keep the source language.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("中文", "中文 (Chinese)")
          .addOption("English", "English")
          .addOption("Original", "原语言 (Keep Original)")
          .setValue(this.plugin.settings.outputLanguage)
          .onChange(async (value) => {
            this.plugin.settings.outputLanguage = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Text Generation Model" });

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

    containerEl.createEl("h3", { text: "Embedding Model (Semantic Search)" });

    new Setting(containerEl)
      .setName("Enable Semantic Search")
      .setDesc("If disabled, queries will fallback to simple keyword matching.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableEmbedding)
          .onChange(async (value) => {
            this.plugin.settings.enableEmbedding = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh UI to hide/show embedding settings
          })
      );

    if (this.plugin.settings.enableEmbedding) {
      new Setting(containerEl)
        .setName("Embedding Provider Type")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("volcengine", "Volcengine (火山/字节)")
            .addOption("openai", "OpenAI / Custom")
            .setValue(this.plugin.settings.embedProviderType)
            .onChange(async (value) => {
              this.plugin.settings.embedProviderType = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Embedding API Key")
        .addText((text) => {
          text.inputEl.type = "password";
          text
            .setPlaceholder("Leave blank to use Text Gen API Key")
            .setValue(this.plugin.settings.embedApiKey)
            .onChange(async (value) => {
              this.plugin.settings.embedApiKey = value;
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Embedding Base URL")
        .addText((text) =>
          text
            .setPlaceholder("Leave blank to use Text Gen Base URL")
            .setValue(this.plugin.settings.embedBaseUrl)
            .onChange(async (value) => {
              this.plugin.settings.embedBaseUrl = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Embedding Model Name")
        .addText((text) =>
          text
            .setValue(this.plugin.settings.embedModelName)
            .onChange(async (value) => {
              this.plugin.settings.embedModelName = value;
              await this.plugin.saveSettings();
            })
        );
    }

    containerEl.createEl("h3", { text: "Quick Actions" });

    const actionOptions: Record<string, string> = {
      init: "Init",
      compile: "Compile",
      query: "Query",
      followup: "Follow-up",
      authoritative: "Mark Authoritative",
      status: "Status",
      schema: "Schema Diff"
    };

    for (let i = 0; i < 5; i++) {
      new Setting(containerEl)
        .setName(`Button ${i + 1}`)
        .addDropdown((dropdown) => {
          Object.entries(actionOptions).forEach(([value, label]) => dropdown.addOption(value, label));
          dropdown
            .setValue(this.plugin.settings.quickActions[i] ?? "init")
            .onChange(async (value) => {
              this.plugin.settings.quickActions[i] = value;
              await this.plugin.saveSettings();
              this.plugin.onSettingsChanged();
            });
        });
    }

    containerEl.createEl("h3", { text: "Connection Test" });

    new Setting(containerEl)
      .setName("Test Text Model")
      .addButton((btn) =>
        btn.setButtonText("Run").onClick(async () => {
          await this.plugin.testTextModel();
        })
      );

    new Setting(containerEl)
      .setName("Test Embedding Model")
      .addButton((btn) =>
        btn.setButtonText("Run").onClick(async () => {
          await this.plugin.testEmbeddingModel();
        })
      );
  }
}
