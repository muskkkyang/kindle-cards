import assert from "node:assert/strict";
import test from "node:test";
import { createApiApp } from "../server.mjs";

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
  assert.equal(payload.version, "1.0.0");
  assert.equal(payload.buildId, "test-build");
});

test("Kindle endpoint returns a bounded public payload without exposing a local path", async (context) => {
  const getClippings = async () => ({
    source: "Kindle / My Clippings.txt",
    importedAt: "2026-09-01T00:00:00.000Z",
    memos: [{ id: "memo-1", quote: "摘录" }],
  });
  const { server, baseUrl } = await listen(createApiApp({ getClippings }));
  context.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/kindle-clippings`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "Kindle / My Clippings.txt");
  assert.equal(JSON.stringify(payload).includes("E:\\"), false);
});

test("unknown API routes return JSON 404 responses", async (context) => {
  const { server, baseUrl } = await listen(createApiApp());
  context.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/not-found`);
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
});
