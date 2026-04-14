# Obsidian LLM Wiki Plugin Design Document

Date: 2026-04-14
Status: Draft (Pending User Review)

## 1. Background & Goals

The `llmwiki-cli` tool currently functions as an independent command-line utility for converting raw markdown files into structured wiki content using LLMs (specifically Volcano/Byte models). The goal of this project is to create an Obsidian plugin that wraps the core logic of `llmwiki-cli`, allowing users to compile wikis and execute queries directly from within their Obsidian notes.

### 1.1 Core Objectives
1. **Desktop-Only Integration**: The plugin will rely on Node.js built-in modules (`fs`, `path`) and will therefore be restricted to the Desktop version of Obsidian.
2. **Integrated Library**: The plugin will import core logic from the existing `llmwiki-cli` codebase, rather than executing it as a separate `child_process`.
3. **Vault Integration**: 
   - `wiki/` and `outputs/` folders will reside at the root of the Obsidian vault.
   - The user will be able to specify the relative path to their `raw/` folder within the vault during initialization or via the plugin settings.
4. **Model Support**: The primary LLM provider will be Volcengine (火山/字节), but the settings tab will allow users to configure custom endpoints and API keys to support other OpenAI-compatible providers.

## 2. Architecture

### 2.1 Plugin Structure
The plugin will be a standard Obsidian Desktop plugin. It will add commands to the Obsidian Command Palette and feature a Settings Tab for configuration.

### 2.2 Core Package Modifications
To support integration, `llmwiki-cli` will need minor modifications:
- **Exporting Pipelines**: The core functions (`compilePipeline`, `queryPipeline`, `initPipeline`) must be exported so they can be invoked programmatically.
- **Dynamic Paths**: `src/core/paths.ts` must be updated to read `rawDir`, `wikiDir`, and `outputsDir` from `config/llm-wiki.config.json` instead of hardcoding them relative to the root.

## 3. User Interface & Interactions

### 3.1 Settings Tab
The plugin will provide an Obsidian Settings Tab containing:
- **Paths Configuration**:
  - `Raw Directory Path` (e.g., `Notes/Inbox` or `raw`)
- **LLM Configuration**:
  - `Provider Type` (Dropdown: Volcengine, Custom/OpenAI)
  - `API Key` (Password input)
  - `Base URL` (Text input, defaults to Volcengine endpoint)
  - `Model Name` (Text input, e.g., `ep-20240414-xxx`)
  - `Temperature` and `Max Tokens` (Number inputs)

### 3.2 Obsidian Commands
1. **`LLM Wiki: Initialize`**
   - **Action**: Creates the standard `llm-wiki` folder structure (`config/`, `.llm-wiki/`) in the vault root, using the configured `raw/` path.
   - **Feedback**: Shows an Obsidian `Notice("LLM Wiki initialized.")`.

2. **`LLM Wiki: Compile`**
   - **Action**: Runs the `compilePipeline` using the vault's base path as the working directory.
   - **Feedback**: Shows a progress `Notice("Compiling wiki...")` and a success notification upon completion.

3. **`LLM Wiki: Query`**
   - **Action**: Opens a centered Obsidian Modal with a text input box.
   - **Interaction**: The user types a question and presses Enter. The plugin runs `queryPipeline`, generates the markdown output in `outputs/`.
   - **Feedback**: Automatically opens the newly generated output file in the active workspace leaf.

4. **`LLM Wiki: Status`**
   - **Action**: Reads the `.llm-wiki/index.json` and displays the current index status (total raw files, compiled files) in an Obsidian `Notice`.

## 4. Technical Details

### 4.1 Dependency Management
- The plugin will be developed in a new directory (e.g., `obsidian-llmwiki-plugin`).
- It will depend on the local `llm-wiki` package.
- A build script using `esbuild` will bundle the plugin, externalizing `obsidian` while bundling the local `llm-wiki` logic and its Node dependencies (since it's a desktop plugin, built-in Node modules like `fs` and `path` will remain external).

### 4.2 Handling Environment Variables
Since Obsidian plugins don't inherently load `.env` files in the same way a CLI does, the plugin will inject the user's configured API Key and Base URL directly into the `llmwiki-cli` configuration object or Node's `process.env` before executing the pipelines.

## 5. Security & Privacy
- The API Key will be stored in Obsidian's local `data.json` plugin configuration. Users should be advised not to commit this file if they sync their vault via public Git repositories.
- The plugin will only access files within the Obsidian vault.

## 6. Milestones
- **M1**: Refactor `llmwiki-cli` to export pipelines and support dynamic paths.
- **M2**: Scaffold the Obsidian plugin, implement the Settings Tab, and bind configurations.
- **M3**: Implement the `Initialize` and `Compile` commands with `Notice` feedback.
- **M4**: Implement the `Query` modal and auto-open functionality.
