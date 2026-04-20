import { SchemaDiff } from "./schema.js";

export function renderSchemaDiffMarkdown(diff: SchemaDiff) {
  const lines: string[] = [];
  lines.push("# Schema Diff");
  lines.push("");
  lines.push("## Missing");
  lines.push("");
  if (diff.missing.length === 0) lines.push("- (none)");
  else for (const m of diff.missing) lines.push(`- ${m.kind}: ${m.id}`);
  lines.push("");
  lines.push("## Extra");
  lines.push("");
  if (diff.extra.length === 0) lines.push("- (none)");
  else for (const x of diff.extra) lines.push(`- ${x.kind}: ${x.id}`);
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const n of diff.notes) lines.push(`- ${n}`);
  lines.push("");
  return lines.join("\n");
}

