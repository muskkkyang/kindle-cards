import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { MAX_IMAGE_BYTES } from "./screenshotStore.mjs";

const run = promisify(execFile);
const script = fileURLToPath(
  new URL("../../scripts/scan-kindle-screenshots.ps1", import.meta.url),
);
const hash = (text) => createHash("sha256").update(text).digest("hex");
const folders = ["", "screenshots", "Screenshots", "documents/screenshots"];

export async function kindleVolumes() {
  const roots =
    process.platform === "win32"
      ? Array.from(
          { length: 24 },
          (_, i) => `${String.fromCharCode(67 + i)}:\\`,
        )
      : ["/Volumes/Kindle", "/media/Kindle", path.join(os.homedir(), "Kindle")];
  const found = [];
  for (const root of roots) {
    for (const marker of ["documents/My Clippings.txt", "system/version.txt"]) {
      try {
        if ((await fs.stat(path.join(root, marker))).isFile()) {
          found.push(root);
          break;
        }
      } catch {
        /* Not a mounted Kindle. */
      }
    }
  }
  return found;
}

export async function scanKindleScreenshots(
  store,
  { roots, runReader = run, platform = process.platform } = {},
) {
  roots ??= await kindleVolumes();
  const known = new Set(
    (await store.list()).flatMap((item) => item.sourceKeys),
  );
  const result = { connected: roots.length > 0, discovered: 0, warnings: [] };
  let processed = 0;
  for (const root of roots) {
    for (const folder of folders) {
      let entries;
      const directory = path.join(root, folder);
      try {
        if ((await fs.lstat(directory)).isSymbolicLink()) continue;
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (
          !entry.isFile() ||
          !(folder ? /\.(png|jpe?g)$/i : /^screenshot.*\.(png|jpe?g)$/i).test(
            entry.name,
          )
        )
          continue;
        const filename = path.join(directory, entry.name);
        const stat = await fs.stat(filename);
        const sourceKey = hash(`${filename}|${stat.size}|${stat.mtimeMs}`);
        if (known.has(sourceKey)) continue;
        if (stat.size > MAX_IMAGE_BYTES) {
          result.warnings.push(`${entry.name} 超过 20 MB，已跳过。`);
          continue;
        }
        if (processed >= 12) continue;
        const bytes = await fs.readFile(filename);
        const after = await fs.stat(filename);
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
          continue;
        await store.add(bytes, entry.name, sourceKey);
        known.add(sourceKey);
        processed++;
        result.discovered++;
      }
    }
  }
  if (platform !== "win32") return result;
  const snapshot = await fs.mkdtemp(
    path.join(os.tmpdir(), "kindle-screenshots-"),
  );
  try {
    const knownFile = path.join(snapshot, "known.json");
    await fs.writeFile(knownFile, JSON.stringify([...known]));
    const { stdout } = await runReader(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-DestinationDirectory",
        snapshot,
        "-KnownFile",
        knownFile,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 25_000,
        maxBuffer: 1024 * 1024,
      },
    );
    const payload = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
    if (!payload.ok)
      throw new Error("读取 Kindle 截图失败，请重新连接设备后重试。");
    result.connected ||= payload.connected;
    result.warnings.push(...(payload.warnings || []));
    for (const file of payload.files || []) {
      if (
        !/^\d+[/\\][^/\\]+\.(png|jpe?g)$/i.test(file.relativePath) ||
        file.relativePath.includes("..")
      )
        throw new Error("截图读取器返回了无效路径。");
      const filename = path.resolve(snapshot, file.relativePath);
      if (!filename.startsWith(snapshot + path.sep))
        throw new Error("截图路径超出临时目录。");
      const stat = await fs.stat(filename);
      if (stat.size > MAX_IMAGE_BYTES) throw new Error("截图超过 20 MB。");
      await store.add(await fs.readFile(filename), file.name, file.sourceKey);
      result.discovered++;
    }
    return result;
  } finally {
    await fs.rm(snapshot, { recursive: true, force: true });
  }
}
