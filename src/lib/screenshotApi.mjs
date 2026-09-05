import express from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { scanKindleScreenshots } from "./kindleScreenshots.mjs";
import { MAX_IMAGE_BYTES } from "./screenshotStore.mjs";

const run = promisify(execFile);
export async function recognizeScreenshot(filename) {
  if (process.platform !== "win32")
    throw new Error(
      "本地 OCR 目前支持 Windows，可直接填写识别文字继续制作卡片。",
    );
  const script = fileURLToPath(
    new URL("../../scripts/ocr-screenshot.ps1", import.meta.url),
  );
  const { stdout } = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-ImagePath",
      filename,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  if (!result.ok)
    throw new Error(
      `文字识别失败：${result.message || "请检查 Windows OCR 语言包。"}`,
    );
  return { text: result.text, language: result.language };
}

function publicItem(item) {
  return {
    id: item.id,
    name: item.name,
    extension: item.extension,
    edit: item.edit,
    createdAt: item.createdAt,
    imported: item.imported,
    url: `/api/screenshots/${item.id}/original`,
  };
}

export function screenshotRouter(
  store,
  { scan = scanKindleScreenshots, ocr = recognizeScreenshot } = {},
) {
  const router = express.Router();
  let scanning = null;
  let ocrBusy = false;
  router.use((request, response, next) => {
    if (request.method !== "GET") {
      const origin = request.get("origin");
      if (
        request.get("sec-fetch-site") === "cross-site" ||
        (origin && origin !== `http://${request.get("host")}`)
      )
        return response
          .status(403)
          .json({ ok: false, message: "仅允许本地应用发起截图操作。" });
    }
    next();
  });
  router.get("/", async (_request, response, next) => {
    try {
      response.json({ ok: true, items: (await store.list()).map(publicItem) });
    } catch (error) {
      next(error);
    }
  });
  router.post("/scan", async (_request, response, next) => {
    try {
      scanning ??= scan(store).finally(() => {
        scanning = null;
      });
      const result = await scanning;
      response.json({
        ok: true,
        ...result,
        items: (await store.list()).map(publicItem),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    "/upload",
    express.raw({
      type: ["image/png", "image/jpeg", "application/octet-stream"],
      limit: MAX_IMAGE_BYTES,
    }),
    async (request, response, next) => {
      try {
        const name =
          typeof request.query.name === "string"
            ? request.query.name
            : "Screenshot";
        response.json({
          ok: true,
          item: publicItem(await store.add(request.body, name, "", true)),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get("/:id/original", async (request, response, next) => {
    try {
      const item = await store.get(request.params.id);
      response.type(item.extension === "png" ? "png" : "jpeg");
      response.sendFile(store.originalPath(item));
    } catch (error) {
      next(error);
    }
  });
  router.patch(
    "/:id",
    express.json({ limit: "100kb" }),
    async (request, response, next) => {
      try {
        if (!request.body || typeof request.body !== "object")
          throw new Error("无效的截图编辑请求。");
        response.json({
          ok: true,
          item: publicItem(await store.update(request.params.id, request.body)),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post("/:id/ocr", async (request, response, next) => {
    if (ocrBusy)
      return response
        .status(409)
        .json({ ok: false, message: "正在识别文字，请稍候。" });
    ocrBusy = true;
    try {
      const item = await store.get(request.params.id);
      response.json({ ok: true, ...(await ocr(store.originalPath(item))) });
    } catch (error) {
      next(error);
    } finally {
      ocrBusy = false;
    }
  });
  router.use((error, _request, response, _next) => {
    response.status(error.type === "entity.too.large" ? 413 : 400).json({
      ok: false,
      message:
        error.type === "entity.too.large"
          ? "截图须小于 20 MB。"
          : error.message || "截图操作失败，原始数据已保留。",
    });
  });
  return router;
}
