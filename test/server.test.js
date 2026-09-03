import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApiApp, readMtpKindleClippings } from "../server.mjs";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

async function listen(app) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("health endpoint is private-cache safe and includes build identity", async (context) => {
  const { server, baseUrl } = await listen(
    createApiApp({ buildId: "test-build" }),
  );
  context.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(payload.ok, true);
  assert.equal(payload.app, "kindle-cards");
  assert.equal(payload.version, packageJson.version);
  assert.equal(payload.buildId, "test-build");
});

test("Kindle endpoint returns a bounded public payload without exposing a local path", async (context) => {
  const getClippings = async () => ({
    source: "Kindle / My Clippings.txt",
    transport: "mtp",
    revision: "revision-1",
    importedAt: "2026-09-01T00:00:00.000Z",
    memos: [{ id: "memo-1", quote: "摘录" }],
  });
  const { server, baseUrl } = await listen(createApiApp({ getClippings }));
  context.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/kindle-clippings`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.changed, true);
  assert.equal(payload.source, "Kindle / My Clippings.txt");
  assert.equal(JSON.stringify(payload).includes("E:\\"), false);
});

test("Kindle endpoint omits memos when the content revision has not changed", async (context) => {
  const getClippings = async () => ({
    source: "Kindle Paperwhite / My Clippings.txt",
    transport: "mtp",
    revision: "same-revision",
    importedAt: "2026-09-03T00:00:00.000Z",
    memos: [{ id: "memo-1", quote: "摘录" }],
  });
  const { server, baseUrl } = await listen(createApiApp({ getClippings }));
  context.after(() => close(server));

  const response = await fetch(
    `${baseUrl}/api/kindle-clippings?revision=same-revision`,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.changed, false);
  assert.equal(payload.revision, "same-revision");
  assert.equal("memos" in payload, false);
});

test("MTP reader parses a Windows Shell snapshot without exposing its path", async (context) => {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "kindle-cards-server-test-"),
  );
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const clippingText = await readFile(
    new URL("../sample-clippings.txt", import.meta.url),
    "utf8",
  );
  const runReader = async (_executable, args) => {
    const destination = args.at(-1);
    await writeFile(path.join(destination, "My Clippings.txt"), clippingText);
    return {
      stdout: `${JSON.stringify({
        ok: true,
        deviceName: "Kindle Paperwhite",
        fileName: "My Clippings.txt",
        size: Buffer.byteLength(clippingText),
      })}\n`,
      stderr: "",
    };
  };

  const payload = await readMtpKindleClippings({ runReader, temporaryRoot });

  assert.equal(payload.transport, "mtp");
  assert.equal(payload.source, "Kindle Paperwhite / My Clippings.txt");
  assert.equal(payload.memos.length > 0, true);
  assert.match(payload.revision, /^[a-f0-9]{64}$/u);
});

test("unknown API routes return JSON 404 responses", async (context) => {
  const { server, baseUrl } = await listen(createApiApp());
  context.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/not-found`);
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
});
