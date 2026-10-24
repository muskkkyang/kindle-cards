import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApiApp } from "../server.mjs";
import {
  createBackupArchive,
  restoreBackupArchive,
} from "../src/lib/backupArchive.mjs";
import { listenForTest } from "./helpers/loopback.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

test("local covers/backgrounds deduplicate, remain private, and survive backup/restore", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kc-media-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const { server, baseUrl } = await listenForTest(
    createApiApp({ screenshotDirectory: source }),
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const upload = () =>
    fetch(`${baseUrl}/api/media/upload`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
  const first = await (await upload()).json();
  const second = await (await upload()).json();
  assert.equal(first.ok, true);
  assert.equal(first.url, second.url);
  assert.deepEqual(
    Buffer.from(await (await fetch(baseUrl + first.url)).arrayBuffer()),
    png,
  );
  const denied = await fetch(`${baseUrl}/api/media/upload`, {
    method: "POST",
    headers: { "Content-Type": "image/png", Origin: "https://other.example" },
    body: png,
  });
  assert.equal(denied.status, 403);
  const invalid = await fetch(`${baseUrl}/api/media/upload`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: "not an image",
  });
  assert.equal(invalid.status, 400);
  const settings = {
    template: "editorial",
    theme: "paper",
    size: "phone",
    font: "serif",
    fontScale: 1.2,
    background: first.url,
    bookCovers: { book: first.url },
  };
  const bytes = await createBackupArchive({
    memos: [],
    settings,
    screenshotDirectory: source,
    appVersion: "test",
  });
  const destination = path.join(root, "restored");
  const restored = await restoreBackupArchive({
    bytes,
    screenshotDirectory: destination,
  });
  assert.deepEqual(restored.settings, settings);
  assert.deepEqual(
    await fs.readFile(
      path.join(destination, "media", first.url.split("/").at(-1)),
    ),
    png,
  );
  await restoreBackupArchive({ bytes, screenshotDirectory: destination });
  assert.equal((await fs.readdir(path.join(destination, "media"))).length, 1);
});
