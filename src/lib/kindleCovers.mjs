import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import express from "express";
import { kindleVolumes } from "./kindleScreenshots.mjs";
import {
  extractBookCover,
  matchBookCovers,
  MAX_BOOK_BYTES,
} from "./bookCover.mjs";
import { storeMedia } from "./mediaStore.mjs";

const run = promisify(execFile);
const script = fileURLToPath(
  new URL("../../scripts/scan-kindle-books.ps1", import.meta.url),
);
const supported = /\.(epub|mobi|azw|azw3|kfx)$/iu;

export function createCoverScanner(
  directory,
  { roots, platform = process.platform, runReader = run } = {},
) {
  const known = new Map();
  return async function scan(books = []) {
    const result = {
      connected: false,
      pending: false,
      unsupported: 0,
      unreadable: 0,
      candidates: [],
    };
    const activeRoots = roots ?? (await kindleVolumes());
    const observed = new Set();
    let processed = 0;
    async function readBook(
      filename,
      extension,
      key,
      sourceName = path.basename(filename),
    ) {
      if (known.has(key)) return;
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.size > MAX_BOOK_BYTES) {
        known.set(key, null);
        result.unreadable++;
        return;
      }
      const bytes = await fs.readFile(filename);
      const after = await fs.stat(filename);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
        throw new Error("电子书正在变化，请稍后重试封面同步。");
      let metadata;
      try {
        metadata = await extractBookCover(bytes, extension);
      } catch {
        known.set(key, null);
        result.unreadable++;
        return;
      }
      if (!metadata.cover) {
        known.set(key, null);
        result.unreadable++;
        return;
      }
      const url = await storeMedia(directory, metadata.cover);
      known.set(key, {
        title: metadata.title,
        authors: metadata.authors,
        url,
        sourceTitle: sourceName
          .replace(/\.(?:epub|mobi|azw3?|kfx)$/iu, "")
          .replace(/_[a-z0-9]{10,}$/iu, ""),
      });
    }
    for (const root of activeRoots) {
      result.connected = true;
      const queue = [{ directory: path.join(root, "documents"), depth: 0 }];
      let visited = 0;
      while (queue.length && visited < 5000) {
        const current = queue.shift();
        let entries;
        try {
          if ((await fs.lstat(current.directory)).isSymbolicLink()) continue;
          entries = await fs.readdir(current.directory, {
            withFileTypes: true,
          });
        } catch (error) {
          if (error.code === "ENOENT") continue;
          throw error;
        }
        for (const entry of entries) {
          visited++;
          const filename = path.join(current.directory, entry.name);
          if (
            entry.isDirectory() &&
            current.depth < 5 &&
            !entry.name.endsWith(".sdr")
          )
            queue.push({ directory: filename, depth: current.depth + 1 });
          if (!entry.isFile()) continue;
          if (!supported.test(entry.name)) continue;
          const stat = await fs.stat(filename);
          const key = createHash("sha256")
            .update(`${filename}|${stat.size}|${stat.mtimeMs}`)
            .digest("hex");
          observed.add(key);
          if (known.has(key)) continue;
          if (processed >= 8) {
            result.pending = true;
            continue;
          }
          await readBook(filename, path.extname(entry.name), key);
          processed++;
        }
      }
      if (queue.length)
        throw new Error("电子书目录过多，请缩小设备书籍目录后重试。");
    }
    if (platform === "win32") {
      const snapshot = await fs.mkdtemp(
        path.join(os.tmpdir(), "kindle-covers-"),
      );
      try {
        const knownFile = path.join(snapshot, "known.json");
        await fs.writeFile(knownFile, JSON.stringify([...known.keys()]));
        const wantedFile = path.join(snapshot, "wanted.json");
        await fs.writeFile(wantedFile, JSON.stringify(books));
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
            "-WantedFile",
            wantedFile,
          ],
          {
            encoding: "utf8",
            windowsHide: true,
            timeout: 35_000,
            maxBuffer: 2 * 1024 * 1024,
          },
        );
        const payload = JSON.parse(stdout.trim().split(/\r?\n/u).at(-1));
        if (!payload.ok) throw new Error("Kindle 封面读取失败。");
        result.connected ||= Boolean(payload.connected);
        result.pending ||= Boolean(payload.pending);
        result.unsupported += payload.unsupported || 0;
        for (const key of payload.observed || []) observed.add(key);
        for (const key of payload.skipped || []) {
          known.set(key, null);
          result.unreadable++;
        }
        if (!Array.isArray(payload.files) || payload.files.length > 8)
          throw new Error("封面读取器返回了过多文件。");
        for (const file of payload.files) {
          if (
            typeof file.relativePath !== "string" ||
            !/^\d+[/\\][^/\\]+$/u.test(file.relativePath) ||
            file.relativePath
              .split(/[/\\]/u)
              .some((part) => part === "." || part === "..") ||
            !/^\.(epub|mobi|azw|azw3|kfx)$/iu.test(file.extension) ||
            !/^[a-f0-9]{64}$/u.test(file.sourceKey)
          )
            throw new Error("封面读取器返回了无效路径或标识。");
          if (
            !path
              .resolve(snapshot, file.relativePath)
              .startsWith(snapshot + path.sep)
          )
            throw new Error("封面文件超出临时目录。");
          await readBook(
            path.join(snapshot, file.relativePath),
            file.extension,
            file.sourceKey,
            file.sourceName,
          );
          observed.add(file.sourceKey);
        }
      } finally {
        await fs.rm(snapshot, { recursive: true, force: true });
      }
    }
    if (
      result.connected &&
      !result.pending &&
      (platform !== "win32" || !books.length)
    ) {
      for (const key of known.keys()) if (!observed.has(key)) known.delete(key);
    }
    result.candidates = [...known.values()].filter(Boolean);
    return result;
  };
}

export function kindleCoverRouter(directory, options = {}) {
  const router = express.Router();
  const scan = options.scan ?? createCoverScanner(directory, options);
  let scanning = null;
  router.post(
    "/scan",
    express.json({ limit: "1mb" }),
    async (request, response) => {
      const origin = request.get("origin");
      if (
        request.get("sec-fetch-site") === "cross-site" ||
        (origin && origin !== `http://${request.get("host")}`)
      )
        return response
          .status(403)
          .json({ ok: false, message: "仅允许本地应用读取封面。" });
      const books = request.body?.books;
      if (
        !Array.isArray(books) ||
        books.length > 500 ||
        books.some(
          (book) =>
            !book ||
            typeof book.title !== "string" ||
            !book.title.trim() ||
            typeof book.author !== "string" ||
            JSON.stringify([book.title.trim(), book.author.trim()]).length >
              1000,
        )
      )
        return response
          .status(400)
          .json({ ok: false, message: "书籍列表格式无效或超过 500 本。" });
      try {
        scanning ??= scan(books).finally(() => {
          scanning = null;
        });
        const result = await scanning;
        response.json({
          ok: true,
          connected: result.connected,
          pending: result.pending,
          unsupported: result.unsupported,
          unreadable: result.unreadable,
          ...matchBookCovers(books, result.candidates),
        });
      } catch {
        response.status(500).json({
          ok: false,
          message:
            "读取 Kindle 封面失败，请确认设备连接后重试；已有封面已保留。",
        });
      }
    },
  );
  router.use((error, _request, response, _next) => {
    response.status(error.type === "entity.too.large" ? 413 : 400).json({
      ok: false,
      message: "书籍列表无法读取或超过大小限制。",
    });
  });
  return router;
}
