import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createScreenshotStore } from "../src/lib/screenshotStore.mjs";
import { scanKindleScreenshots } from "../src/lib/kindleScreenshots.mjs";
import { createApiApp } from "../server.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kc-screenshot-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: createScreenshotStore(path.join(root, "assets")) };
}

test("duplicate images merge across devices and concurrent imports, preserving edits and original", async (t) => {
  const { store } = await fixture(t);
  const [first] = await Promise.all([
    store.add(png, "one.png", "device-a"),
    store.add(png, "two.png", "device-b"),
  ]);
  const edit = {
    ...first.edit,
    book: "一本书",
    caption: "自己的批注",
    crop: { x: 10, y: 5, width: 85, height: 90 },
  };
  await store.update(first.id, { edit, imported: true });
  await store.add(png, "again.png", "device-c");
  const items = await store.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].imported, true);
  assert.deepEqual(items[0].edit, edit);
  assert.equal(items[0].sourceKeys.length, 3);
  assert.deepEqual(await fs.readFile(store.originalPath(items[0])), png);
  const reopened = createScreenshotStore(store.directory);
  assert.deepEqual((await reopened.list())[0].edit, edit);
});

test("partial metadata revision and rejected crop never overwrite previous content", async (t) => {
  const { store } = await fixture(t);
  const item = await store.add(png, "one.png", "", true);
  await assert.rejects(
    store.update(item.id, {
      edit: { ...item.edit, crop: { x: 90, y: 0, width: 40, height: 100 } },
    }),
    /裁切/,
  );
  await fs.writeFile(
    path.join(store.directory, item.id, "000000000002.json"),
    '{"partial":',
  );
  assert.deepEqual((await store.list())[0], item);
  await store.update(item.id, { edit: { ...item.edit, caption: "Recovered" } });
  assert.equal((await store.list())[0].edit.caption, "Recovered");
});

test("volume screenshots are discovered incrementally without changing files, disconnect keeps imports", async (t) => {
  const { root, store } = await fixture(t);
  const kindle = path.join(root, "device");
  await fs.mkdir(kindle);
  await fs.writeFile(path.join(kindle, "screenshot_2026.png"), png);
  const first = await scanKindleScreenshots(store, {
    roots: [kindle],
    platform: "linux",
  });
  assert.equal(first.connected, true);
  assert.equal(first.discovered, 1);
  const again = await scanKindleScreenshots(store, {
    roots: [kindle],
    platform: "linux",
  });
  assert.equal(again.discovered, 0);
  const disconnected = await scanKindleScreenshots(store, {
    roots: [],
    platform: "linux",
  });
  assert.equal(disconnected.connected, false);
  assert.equal((await store.list()).length, 1);
  assert.deepEqual(
    await fs.readFile(path.join(kindle, "screenshot_2026.png")),
    png,
  );
});

test("MTP snapshots import safely, and failures preserve the existing library", async (t) => {
  const { store } = await fixture(t);
  const runReader = async (_exe, args) => {
    await fs.access(args[args.indexOf("-File") + 1]);
    const folder = args[args.indexOf("-DestinationDirectory") + 1];
    await fs.mkdir(path.join(folder, "0"));
    await fs.writeFile(path.join(folder, "0", "screenshot.png"), png);
    return {
      stdout: JSON.stringify({
        ok: true,
        connected: true,
        files: [
          {
            relativePath: "0/screenshot.png",
            name: "screenshot.png",
            sourceKey: "mtp-fixture",
          },
        ],
      }),
    };
  };
  assert.equal(
    (
      await scanKindleScreenshots(store, {
        roots: [],
        platform: "win32",
        runReader,
      })
    ).discovered,
    1,
  );
  await assert.rejects(
    scanKindleScreenshots(store, {
      roots: [],
      platform: "win32",
      runReader: async () => {
        throw new Error("disconnected");
      },
    }),
  );
  assert.equal((await store.list()).length, 1);
  await assert.rejects(
    scanKindleScreenshots(store, {
      roots: [],
      platform: "win32",
      runReader: async () => ({
        stdout: JSON.stringify({
          ok: true,
          files: [{ relativePath: "../outside.png" }],
        }),
      }),
    }),
    /无效路径/,
  );
});

test("screenshot HTTP workflow uploads, edits, recognizes, reloads and serves original", async (t) => {
  const { root } = await fixture(t);
  const app = createApiApp({
    screenshotDirectory: path.join(root, "http"),
    screenshotOptions: {
      scan: async () => ({ connected: false }),
      ocr: async () => ({ text: "识别出的文字", language: "zh-Hans" }),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/screenshots`;
  const upload = await fetch(`${base}/upload?name=test.png`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: png,
  });
  assert.equal(upload.status, 200);
  const { item } = await upload.json();
  assert.equal(item.sourceKeys, undefined);
  const edit = { ...item.edit, book: "测试书籍", caption: "可重载" };
  assert.equal(
    (
      await fetch(`${base}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edit }),
      })
    ).status,
    200,
  );
  const list = await (await fetch(base)).json();
  assert.equal(list.items[0].edit.caption, "可重载");
  assert.deepEqual(
    Buffer.from(
      await (await fetch(`${base}/${item.id}/original`)).arrayBuffer(),
    ),
    png,
  );
  assert.equal(
    (await (await fetch(`${base}/${item.id}/ocr`, { method: "POST" })).json())
      .text,
    "识别出的文字",
  );
  assert.equal(
    (
      await fetch(`${base}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "image/png",
          Origin: "https://other.example",
        },
        body: png,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/upload`, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: Buffer.from("bad image"),
      })
    ).status,
    400,
  );
});
