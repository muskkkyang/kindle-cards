import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { imageType, validateEdit } from "./screenshotStore.mjs";

export const BACKUP_FORMAT = "kindle-cards-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const MAX_RESTORED_BYTES = 512 * 1024 * 1024;
const MAX_BACKUP_FILES = 10_000;
const screenshotFilePattern =
  /^screenshots\/([a-f0-9]{64})\/(original\.(?:png|jpg)|\d{12}\.json)$/u;

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validMemos(value) {
  return (
    Array.isArray(value) &&
    value.length <= 20_000 &&
    value.every(
      (memo) =>
        memo &&
        typeof memo === "object" &&
        typeof memo.id === "string" &&
        memo.id.trim(),
    )
  );
}

function validSettings(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ["quote", "comment", "memo"].includes(value.template) &&
    ["paper", "light", "dark", "receipt"].includes(value.theme) &&
    ["landscape", "square", "portrait", "wide", "phone"].includes(value.size)
  );
}

async function screenshotFiles(directory) {
  const result = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return result;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/u.test(entry.name)) continue;
    const folder = path.join(directory, entry.name);
    for (const file of await fs.readdir(folder, { withFileTypes: true })) {
      if (
        !file.isFile() ||
        !/^(?:original\.(?:png|jpg)|\d{12}\.json)$/u.test(file.name)
      )
        continue;
      result.push({
        name: `screenshots/${entry.name}/${file.name}`,
        bytes: await fs.readFile(path.join(folder, file.name)),
      });
    }
  }
  return result;
}

export async function createBackupArchive({
  memos,
  settings,
  screenshotDirectory,
  appVersion,
  createdAt = new Date().toISOString(),
}) {
  if (!validMemos(memos)) throw new Error("摘录数据格式无效或超过 20,000 条。");
  if (!validSettings(settings)) throw new Error("设置数据格式无效。");

  const files = [
    { name: "memos.json", bytes: jsonBytes(memos) },
    { name: "settings.json", bytes: jsonBytes(settings) },
    ...(await screenshotFiles(screenshotDirectory)),
  ];
  if (files.length > MAX_BACKUP_FILES) throw new Error("备份文件数量过多。");
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.bytes);
  const screenshotIds = new Set(
    files
      .map((file) => screenshotFilePattern.exec(file.name)?.[1])
      .filter(Boolean),
  );
  zip.file(
    "manifest.json",
    jsonBytes({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion,
      createdAt,
      counts: { memos: memos.length, screenshots: screenshotIds.size },
      files: files.map((file) => ({
        path: file.name,
        bytes: file.bytes.length,
        sha256: digest(file.bytes),
      })),
    }),
  );
  const archive = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  if (archive.length > MAX_BACKUP_BYTES)
    throw new Error("生成的备份包超过 256 MB。");
  return archive;
}

function validManifest(value) {
  return (
    value &&
    value.format === BACKUP_FORMAT &&
    value.formatVersion === BACKUP_FORMAT_VERSION &&
    Array.isArray(value.files) &&
    value.files.length <= MAX_BACKUP_FILES
  );
}

export async function restoreBackupArchive({ bytes, screenshotDirectory }) {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > MAX_BACKUP_BYTES
  )
    throw new Error("备份包须小于 256 MB。");
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("备份包无法读取或已经损坏。");
  }
  const archiveEntries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (archiveEntries.length > MAX_BACKUP_FILES + 1)
    throw new Error("备份文件数量过多。");
  let advertisedBytes = 0;
  for (const entry of archiveEntries) {
    const size = entry._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0)
      throw new Error("备份包的文件大小无效。");
    advertisedBytes += size;
    if (advertisedBytes > MAX_RESTORED_BYTES)
      throw new Error("备份解压后的数据超过安全上限。");
  }
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("备份包缺少清单。");
  if (manifestEntry._data?.uncompressedSize > 5 * 1024 * 1024)
    throw new Error("备份清单超过安全上限。");
  let manifest;
  try {
    manifest = JSON.parse(await manifestEntry.async("string"));
  } catch {
    throw new Error("备份清单格式无效。");
  }
  if (!validManifest(manifest)) throw new Error("不支持这个备份包版本。");

  const declared = new Set();
  const validated = new Map();
  let totalBytes = 0;
  for (const item of manifest.files) {
    if (
      !item ||
      typeof item.path !== "string" ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 ||
      !/^[a-f0-9]{64}$/u.test(item.sha256) ||
      declared.has(item.path) ||
      !(
        item.path === "memos.json" ||
        item.path === "settings.json" ||
        screenshotFilePattern.test(item.path)
      )
    )
      throw new Error("备份清单包含无效文件。");
    const fileLimit =
      item.path === "memos.json"
        ? 30 * 1024 * 1024
        : item.path === "settings.json"
          ? 1024 * 1024
          : item.path.includes("/original.")
            ? 20 * 1024 * 1024
            : 2 * 1024 * 1024;
    if (item.bytes > fileLimit)
      throw new Error(`备份文件 ${item.path} 超过安全上限。`);
    const entry = zip.file(item.path);
    if (!entry) throw new Error(`备份包缺少 ${item.path}。`);
    const content = await entry.async("nodebuffer");
    totalBytes += content.length;
    if (
      totalBytes > MAX_RESTORED_BYTES ||
      content.length !== item.bytes ||
      digest(content) !== item.sha256
    )
      throw new Error(`备份文件 ${item.path} 未通过完整性检查。`);
    declared.add(item.path);
    validated.set(item.path, content);
  }
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir && name !== "manifest.json" && !declared.has(name))
      throw new Error("备份包包含清单之外的文件。");
  }

  let memos;
  let settings;
  try {
    memos = JSON.parse(validated.get("memos.json").toString("utf8"));
    settings = JSON.parse(validated.get("settings.json").toString("utf8"));
  } catch {
    throw new Error("备份中的摘录或设置无法读取。");
  }
  if (!validMemos(memos)) throw new Error("备份中的摘录格式无效。");
  if (!validSettings(settings)) throw new Error("备份中的设置格式无效。");

  const groups = new Map();
  for (const [name, content] of validated) {
    const match = screenshotFilePattern.exec(name);
    if (!match) continue;
    const [, id, filename] = match;
    if (!groups.has(id)) groups.set(id, new Map());
    groups.get(id).set(filename, content);
  }
  for (const [id, files] of groups) {
    const extension = files.has("original.png") ? "png" : "jpg";
    const original = files.get(`original.${extension}`);
    const revisions = [...files.keys()].filter((name) =>
      /^\d{12}\.json$/u.test(name),
    );
    if (!original || digest(original) !== id || revisions.length === 0)
      throw new Error("备份中的截图资料不完整。");
    for (const revision of revisions) {
      try {
        const metadata = JSON.parse(files.get(revision).toString("utf8"));
        if (metadata.id !== id || metadata.extension !== extension)
          throw new Error();
        validateEdit(metadata.edit);
      } catch {
        throw new Error("备份中的截图编辑记录无效。");
      }
    }
    if (imageType(original) !== extension)
      throw new Error("备份中的截图文件类型无效。");
  }

  await fs.mkdir(screenshotDirectory, { recursive: true });
  let screenshotsAdded = 0;
  let screenshotsExisting = 0;
  for (const [id, files] of groups) {
    const destination = path.join(screenshotDirectory, id);
    try {
      await fs.access(destination);
      screenshotsExisting += 1;
      continue;
    } catch {
      // A missing screenshot is restored below without replacing current data.
    }
    const staging = await fs.mkdtemp(
      path.join(screenshotDirectory, ".restore-"),
    );
    try {
      for (const [name, content] of files)
        await fs.writeFile(path.join(staging, name), content);
      await fs.rename(staging, destination);
      screenshotsAdded += 1;
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true });
      if (error.code === "EEXIST") screenshotsExisting += 1;
      else throw error;
    }
  }
  return { memos, settings, screenshotsAdded, screenshotsExisting, manifest };
}
