import express from "express";
import {
  createBackupArchive,
  MAX_BACKUP_BYTES,
  restoreBackupArchive,
} from "./backupArchive.mjs";

function allowLocalWrite(request, response, next) {
  const origin = request.get("origin");
  if (
    request.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== `http://${request.get("host")}`)
  )
    return response
      .status(403)
      .json({ ok: false, message: "仅允许本地应用管理备份。" });
  next();
}

export function backupRouter({ screenshotDirectory, appVersion }) {
  const router = express.Router();
  router.use(allowLocalWrite);
  router.post(
    "/export",
    express.json({ limit: "30mb" }),
    async (request, response, next) => {
      try {
        const archive = await createBackupArchive({
          memos: request.body?.memos,
          settings: request.body?.settings,
          screenshotDirectory,
          appVersion,
        });
        response.attachment(
          `kindle-cards-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        );
        response.type("application/zip").send(archive);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/restore",
    express.raw({
      type: [
        "application/zip",
        "application/x-zip-compressed",
        "application/octet-stream",
      ],
      limit: MAX_BACKUP_BYTES,
    }),
    async (request, response, next) => {
      try {
        const result = await restoreBackupArchive({
          bytes: request.body,
          screenshotDirectory,
        });
        response.json({
          ok: true,
          memos: result.memos,
          settings: result.settings,
          screenshotsAdded: result.screenshotsAdded,
          screenshotsExisting: result.screenshotsExisting,
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.use((error, _request, response, _next) => {
    response.status(error.type === "entity.too.large" ? 413 : 400).json({
      ok: false,
      message:
        error.type === "entity.too.large"
          ? "备份包须小于 256 MB。"
          : error.message || "备份操作失败。",
    });
  });
  return router;
}
