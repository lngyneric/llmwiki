import fs from "node:fs/promises";
import path from "node:path";
import { fileExists } from "../core/fs.js";
import { parseSchemaMarkdown, diffSchemaAgainstProject } from "../schema/schema.js";
import { renderSchemaDiffMarkdown } from "../schema/report.js";

export async function schemaCommand(opts: { root?: string; format?: "md" | "json" }) {
  const root = opts.root ?? process.cwd();
  const schemaPath = path.join(root, "SCHEMA.md");
  if (!(await fileExists(schemaPath))) {
    throw new Error("SCHEMA.md not found in project root");
  }

  const md = await fs.readFile(schemaPath, "utf-8");
  const schema = parseSchemaMarkdown(md);
  const diff = diffSchemaAgainstProject(schema, root);

  if (opts.format === "json") {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }
  console.log(renderSchemaDiffMarkdown(diff));
}

