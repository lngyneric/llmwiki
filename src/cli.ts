#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { compileCommand } from "./commands/compile.js";
import { exportCommand } from "./commands/export.js";
import { lintCommand } from "./commands/lint.js";
import { queryCommand } from "./commands/query.js";
import { statusCommand } from "./commands/status.js";
import { schemaCommand } from "./commands/schema.js";

const program = new Command();

program.name("llm-wiki").description("LLM Wiki CLI (raw → wiki compiler)").version("0.0.1");

program
  .command("init")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--model <name>", "LLM model name")
  .action(async (opts) => {
    await initCommand({ root: opts.root, model: opts.model });
  });

program
  .command("compile")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--full", "Full recompile")
  .action(async (opts) => {
    await compileCommand({ root: opts.root, full: !!opts.full });
  });

program
  .command("export")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--out-dir <path>", "Export output directory (default: export)")
  .action(async (opts) => {
    await exportCommand({ root: opts.root, outDir: opts.outDir });
  });

program
  .command("lint")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--dir <path>", "Directory to lint (default: export)")
  .option("--json <path>", "Write JSON report path")
  .option("--md <path>", "Write Markdown report path")
  .action(async (opts) => {
    await lintCommand({ root: opts.root, dir: opts.dir, json: opts.json, md: opts.md });
  });

program
  .command("query")
  .argument("<question>", "Question to ask")
  .option("--root <path>", "Project root (default: cwd)")
  .action(async (question, opts) => {
    await queryCommand({ root: opts.root, question });
  });

program
  .command("status")
  .option("--root <path>", "Project root (default: cwd)")
  .action(async (opts) => {
    await statusCommand({ root: opts.root });
  });

program
  .command("schema")
  .option("--root <path>", "Project root (default: cwd)")
  .option("--format <format>", "Output format: md|json", "md")
  .action(async (opts) => {
    const format = opts.format === "json" ? "json" : "md";
    await schemaCommand({ root: opts.root, format });
  });

program.parse();
