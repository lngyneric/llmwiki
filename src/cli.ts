#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { compileCommand } from "./commands/compile.js";
import { queryCommand } from "./commands/query.js";
import { statusCommand } from "./commands/status.js";

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

program.parse();

