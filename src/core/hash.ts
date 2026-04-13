import crypto from "node:crypto";
import fs from "node:fs/promises";

export async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

