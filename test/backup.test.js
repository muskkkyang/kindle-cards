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
import { storeMedia } from "../src/lib/mediaStore.mjs";
import { randomBytes } from "node:crypto";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const settings = { template: "memo", theme: "paper", size: "portrait" };

test("backup excludes orphan media but retains settings and every historical background", async (context) => {
  const root = await fixture(context);
  const sourceDirectory = path.join(root, "source");
  const media = path.join(sourceDirectory, "media");
  const image = () => Buffer.concat([png, randomBytes(4096)]);
  const oldBackground = await storeMedia(media, image());
  const currentBackground = await storeMedia(media, image());
  const cover = await storeMedia(media, image());
  const source = createScreenshotStore(sourceDirectory);
  const screenshot = await source.add(png, "anonymous.png", "", true);
  await source.update(screenshot.id, {
    edit: { ...screenshot.edit, background: oldBackground },
  });
  await source.update(screenshot.id, {
    edit: { ...screenshot.edit, background: currentBackground },
  });
  const options = {
    memos: [],
    settings: {
      ...settings,
      background: currentBackground,
      bookCovers: { book: cover },
    },
    screenshotDirectory: sourceDirectory,
    appVersion: "test",
    createdAt: "2026-10-22T00:00:00Z",
  };
  const before = await createBackupArchive(options);
  const orphan = await storeMedia(media, image());
  const after = await createBackupArchive(options);
  const zip = await JSZip.loadAsync(after);
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  const mediaPaths = manifest.files
    .filter((item) => item.path.startsWith("media/"))
    .map((item) => item.path)
    .sort();
  assert.deepEqual(
    mediaPaths,
    [oldBackground, currentBackground, cover]
      .map((url) => `media/${url.split("/").at(-1)}`)
      .sort(),
  );
  assert.equal(zip.file(`media/${orphan.split("/").at(-1)}`), null);
  assert.equal(after.length, before.length);
  assert.equal((await fs.readdir(media)).length, 4);
  const destination = path.join(root, "restore");
  await restoreBackupArchive({
    bytes: after,
    screenshotDirectory: destination,
  });
  assert.equal((await fs.readdir(path.join(destination, "media"))).length, 3);
  const revisions = (
    await fs.readdir(path.join(destination, screenshot.id))
  ).filter((name) => name.endsWith(".json"));
  assert.equal(revisions.length, 3);
  assert.equal(
    JSON.parse(
      await fs.readFile(
        path.join(destination, screenshot.id, "000000000002.json"),
        "utf8",
      ),
    ).edit.background,
    oldBackground,
  );
});

test("backup rejects missing referenced media even without a screenshots directory", async (context) => {
  const root = await fixture(context);
  await assert.rejects(
    createBackupArchive({
      memos: [],
      settings: { ...settings, background: `/api/media/${"a".repeat(64)}.png` },
      screenshotDirectory: path.join(root, "not-created"),
      appVersion: "test",
    }),
    /缺失/u,
  );
});

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

test("legacy v1 backups remain readable after the media format upgrade", async (context) => {
  const root = await fixture(context);
  const archive = await createBackupArchive({
    memos: [],
    settings,
    screenshotDirectory: path.join(root, "empty"),
    appVersion: "1.3.0",
  });
  const zip = await JSZip.loadAsync(archive);
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
  manifest.formatVersion = 1;
  zip.file("manifest.json", JSON.stringify(manifest));
  const restored = await restoreBackupArchive({
    bytes: await zip.generateAsync({ type: "nodebuffer" }),
    screenshotDirectory: path.join(root, "legacy"),
  });
  assert.deepEqual(restored.settings, settings);
});
