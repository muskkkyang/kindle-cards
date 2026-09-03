import express from "express";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseKindleClippings } from "./src/lib/kindleParser.js";

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(currentFile);
const packageJson = JSON.parse(
  await fs.readFile(path.join(projectRoot, "package.json"), "utf8"),
);

export const MAX_CLIPPINGS_BYTES = 25 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const mtpReaderPath = path.join(projectRoot, "scripts", "read-kindle-mtp.ps1");

function secureHeaders(_request, response, next) {
  response.set({
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  next();
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findKindleClippings(
  platform = process.platform,
  environment = process.env,
) {
  const candidates = [];

  if (platform === "win32") {
    for (let code = 67; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      candidates.push(path.join(drive, "documents", "My Clippings.txt"));
      candidates.push(path.join(drive, "Documents", "My Clippings.txt"));
    }
  } else {
    const home = environment.HOME || "";
    candidates.push(
      "/Volumes/Kindle/documents/My Clippings.txt",
      "/media/Kindle/documents/My Clippings.txt",
      path.join(home, "Kindle", "documents", "My Clippings.txt"),
    );
  }

  const checks = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      available: await exists(candidate),
    })),
  );
  return checks.find((entry) => entry.available)?.candidate || null;
}

export async function readKindleClippings() {
  const filePath = await findKindleClippings();
  if (filePath) {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw new Error("Kindle 摘录路径不是普通文件。");
    if (stats.size > MAX_CLIPPINGS_BYTES)
      throw new Error("Kindle 摘录文件超过 25 MB，已停止读取。");

    const text = await fs.readFile(filePath, "utf8");
    return createClippingsPayload(text, "Kindle / My Clippings.txt", "volume");
  }

  if (process.platform !== "win32") return null;
  return readMtpKindleClippings();
}

function createClippingsPayload(text, source, transport) {
  const revision = createHash("sha256").update(text).digest("hex");
  return {
    source,
    transport,
    revision,
    importedAt: new Date().toISOString(),
    memos: parseKindleClippings(text),
  };
}

export async function readMtpKindleClippings({
  runReader = execFileAsync,
  temporaryRoot = os.tmpdir(),
} = {}) {
  const snapshotDirectory = await fs.mkdtemp(
    path.join(temporaryRoot, "kindle-cards-mtp-"),
  );

  try {
    const { stdout } = await runReader(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        mtpReaderPath,
        "-DestinationDirectory",
        snapshotDirectory,
      ],
      { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const line = stdout
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean)
      .at(-1);
    if (!line) throw new Error("MTP 读取器没有返回结果。");

    const result = JSON.parse(line);
    if (!result.ok) {
      if (result.reason === "not_found") return null;
      throw new Error("无法从 Windows 便携设备读取 Kindle 摘录。");
    }
    if (
      !Number.isSafeInteger(result.size) ||
      result.size > MAX_CLIPPINGS_BYTES
    ) {
      throw new Error("Kindle 摘录文件超过 25 MB，已停止读取。");
    }

    const fileName = String(result.fileName || "");
    if (
      path.basename(fileName) !== fileName ||
      !/^My Clippings(?:\.txt)?$/iu.test(fileName)
    ) {
      throw new Error("MTP 读取器返回了无效的摘录文件名。");
    }
    const snapshotPath = path.join(snapshotDirectory, fileName);
    const text = await fs.readFile(snapshotPath, "utf8");
    return createClippingsPayload(
      text,
      `${result.deviceName || "Kindle"} / My Clippings.txt`,
      "mtp",
    );
  } finally {
    await fs.rm(snapshotDirectory, { recursive: true, force: true });
  }
}

export function createApiApp({
  getClippings = readKindleClippings,
  buildId = "dev",
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(secureHeaders);

  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      app: "kindle-cards",
      version: packageJson.version,
      buildId,
    });
  });

  app.get("/api/kindle-clippings", async (request, response) => {
    try {
      const payload = await getClippings();
      if (!payload) {
        response.status(404).json({
          ok: false,
          message:
            "没有自动找到 Kindle。请确认已通过 USB 连接，或用“导入文件”选择 My Clippings.txt。",
        });
        return;
      }

      const requestedRevision =
        typeof request.query.revision === "string"
          ? request.query.revision.slice(0, 128)
          : "";
      if (payload.revision && requestedRevision === payload.revision) {
        response.json({
          ok: true,
          changed: false,
          revision: payload.revision,
          source: payload.source,
          transport: payload.transport,
        });
        return;
      }

      response.json({ ok: true, changed: true, ...payload });
    } catch (error) {
      console.error("Failed to read Kindle clippings", error);
      const message =
        error instanceof Error && error.message.includes("25 MB")
          ? error.message
          : "读取 Kindle 摘录失败。";
      response
        .status(message.includes("25 MB") ? 413 : 500)
        .json({ ok: false, message });
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ ok: false, message: "未找到该本地 API。" });
  });

  return app;
}

function parsePort(rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1024 || value > 65_535) {
    throw new Error(`Invalid local port: ${rawValue}`);
  }
  return value;
}

function readArgument(name) {
  const argument = process.argv.find((item) => item.startsWith(`--${name}=`));
  return argument?.slice(name.length + 3);
}

export async function startServer() {
  const port = parsePort(readArgument("port") || process.env.PORT || 4310);
  const buildId =
    (readArgument("build-id") || "dev")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .slice(0, 64) || "dev";
  const isProduction =
    process.env.NODE_ENV === "production" || process.argv.includes("--prod");
  const app = createApiApp({ buildId });

  if (isProduction) {
    const distPath = path.join(projectRoot, "dist");
    const indexPath = path.join(distPath, "index.html");
    if (!(await exists(indexPath))) {
      throw new Error("Production build not found. Run npm run build first.");
    }

    app.use(
      express.static(distPath, {
        index: false,
        maxAge: "1h",
        immutable: false,
      }),
    );
    app.use((request, response, next) => {
      if (request.method !== "GET" || !request.accepts("html")) {
        next();
        return;
      }
      response.set("Cache-Control", "no-cache");
      response.sendFile(indexPath);
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.use((_request, response) => {
    response.status(404).send("Not found");
  });

  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`Kindle Cards running at http://127.0.0.1:${port}`);
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error("Failed to stop Kindle Cards cleanly", error);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === currentFile;

if (isDirectRun) {
  try {
    await startServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
