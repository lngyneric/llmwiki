import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFileAtomic(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, content, "utf-8");
  await fs.rename(tmp, filePath);
}

export async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

