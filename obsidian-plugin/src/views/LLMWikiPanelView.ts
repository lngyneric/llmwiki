import { ItemView, WorkspaceLeaf } from "obsidian";
import type LLMWikiPlugin from "../main";

export const LLMWIKI_PANEL_VIEW_TYPE = "llm-wiki-panel-view";

export class LLMWikiPanelView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: LLMWikiPlugin) {
    super(leaf);
  }

  getViewType() {
    return LLMWIKI_PANEL_VIEW_TYPE;
  }

  getDisplayText() {
    return "LLM Wiki";
  }

  async onOpen() {
    this.render();
  }

  async render() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createEl("h2", { text: "LLM Wiki" });
    header.style.marginTop = "0";

    const btnWrap = contentEl.createDiv();
    for (const id of this.plugin.getQuickActions()) {
      const btn = btnWrap.createEl("button", { text: this.plugin.getActionLabel(id) });
      btn.style.display = "block";
      btn.style.width = "100%";
      btn.style.marginBottom = "8px";
      btn.onclick = () => this.plugin.runAction(id);
    }

    contentEl.createEl("h3", { text: "Schema Diff" });
    const pre = contentEl.createEl("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.setText(this.plugin.schemaDiffText ?? "Not loaded");

    const refresh = contentEl.createEl("button", { text: "Re-analyze" });
    refresh.style.marginTop = "8px";
    refresh.style.width = "100%";
    refresh.onclick = async () => {
      await this.plugin.refreshSchemaDiff();
      this.render();
    };
  }
}

