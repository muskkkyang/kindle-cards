import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { imageType } from "./screenshotStore.mjs";

export const MEDIA_PATTERN = /^[a-f0-9]{64}\.(?:png|jpg)$/u;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export async function storeMedia(directory, bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > MAX_MEDIA_BYTES
  )
    throw new Error("图片须为小于 5 MB 的 PNG 或 JPEG。");
  const extension = imageType(bytes);
  const filename = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(path.join(directory, filename), bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await fs.readFile(path.join(directory, filename));
    if (!existing.equals(bytes))
      throw new Error("已有图片校验失败，未覆盖原文件。", { cause: error });
  }
  return `/api/media/${filename}`;
}

export function mediaRouter(directory) {
  const router = express.Router();
  router.post(
    "/upload",
    express.raw({ type: ["image/png", "image/jpeg"], limit: MAX_MEDIA_BYTES }),
    async (request, response, next) => {
      try {
        const origin = request.get("origin");
        if (
          request.get("sec-fetch-site") === "cross-site" ||
          (origin && origin !== `http://${request.get("host")}`)
        )
          return response
            .status(403)
            .json({ ok: false, message: "仅允许本地应用导入图片。" });
        const bytes = request.body;
        if (!Buffer.isBuffer(bytes) || !bytes.length)
          throw new Error("请选择 PNG 或 JPEG 图片。");
        response.json({ ok: true, url: await storeMedia(directory, bytes) });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get("/:filename", (request, response) => {
    if (!MEDIA_PATTERN.test(request.params.filename))
      return response.status(404).end();
    response.sendFile(
      path.join(directory, request.params.filename),
      (error) => {
        if (error && !response.headersSent) response.status(404).end();
      },
    );
  });
  router.use((error, _request, response, _next) => {
    response.status(error.type === "entity.too.large" ? 413 : 400).json({
      ok: false,
      message:
        error.type === "entity.too.large" ? "图片须小于 5 MB。" : error.message,
    });
  });
  return router;
}
