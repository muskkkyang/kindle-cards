import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import {
  createBackupArchive,
  restoreBackupArchive,
} from "../src/lib/backupArchive.mjs";
import { createScreenshotStore } from "../src/lib/screenshotStore.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const settings = { template: "memo", theme: "paper", size: "portrait" };

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kc-backup-test-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("complete backup restores memos, settings, originals and edit history", async (context) => {
  const root = await fixture(context);
  const sourceDirectory = path.join(root, "source");
  const source = createScreenshotStore(sourceDirectory);
  const item = await source.add(png, "screen.png", "device", true);
  await source.update(item.id, {
    edit: { ...item.edit, book: "测试书", caption: "第二版" },
  });
  const memos = [{ id: "memo-1", title: "测试书", quote: "摘录" }];
  const archive = await createBackupArchive({
    memos,
    settings,
    screenshotDirectory: sourceDirectory,
    appVersion: "test",
    createdAt: "2026-09-15T00:00:00.000Z",
  });
  const destination = path.join(root, "destination");
  const restored = await restoreBackupArchive({
    bytes: archive,
    screenshotDirectory: destination,
  });
  assert.deepEqual(restored.memos, memos);
  assert.deepEqual(restored.settings, settings);
  assert.equal(restored.screenshotsAdded, 1);
  assert.deepEqual(
    await fs.readFile(path.join(destination, item.id, "original.png")),
    png,
  );
  assert.equal(
    (await fs.readdir(path.join(destination, item.id))).filter((name) =>
      name.endsWith(".json"),
    ).length,
    2,
  );
  assert.equal(
    (await createScreenshotStore(destination).list())[0].edit.caption,
    "第二版",
  );
});

test("restore rejects a file that no longer matches the signed manifest", async (context) => {
  const root = await fixture(context);
  const archive = await createBackupArchive({
    memos: [],
    settings,
    screenshotDirectory: path.join(root, "empty"),
    appVersion: "test",
  });
  const zip = await JSZip.loadAsync(archive);
  zip.file("memos.json", "[]\nchanged");
  const changed = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    restoreBackupArchive({
      bytes: changed,
      screenshotDirectory: path.join(root, "restore"),
    }),
    /完整性检查/u,
  );
});

test("restore keeps an existing screenshot instead of replacing it", async (context) => {
  const root = await fixture(context);
  const sourceDirectory = path.join(root, "source");
  const source = createScreenshotStore(sourceDirectory);
  const sourceItem = await source.add(png, "source.png", "", true);
  const archive = await createBackupArchive({
    memos: [],
    settings,
    screenshotDirectory: sourceDirectory,
    appVersion: "test",
  });
  const destination = path.join(root, "destination");
  const current = createScreenshotStore(destination);
  const currentItem = await current.add(png, "current.png", "", true);
  await current.update(currentItem.id, {
    edit: { ...currentItem.edit, caption: "保留当前版本" },
  });
  assert.equal(currentItem.id, sourceItem.id);
  const result = await restoreBackupArchive({
    bytes: archive,
    screenshotDirectory: destination,
  });
  assert.equal(result.screenshotsAdded, 0);
  assert.equal(result.screenshotsExisting, 1);
  assert.equal((await current.list())[0].edit.caption, "保留当前版本");
});
