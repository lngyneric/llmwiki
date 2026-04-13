import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./fs.js";

export async function appendLog(logFile: string, title: string, lines: string[]) {
  await ensureDir(path.dirname(logFile));
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  const body =
    [
      `## ${ts} ${title}`,
      ...lines.map((l) => `- ${l.replace(/\n/g, "\\n")}`),
      ""
    ].join("\n") + "\n";
  await fs.appendFile(logFile, body, "utf-8");
}
