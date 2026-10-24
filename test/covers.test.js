import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { extractBookCover, matchBookCovers } from "../src/lib/bookCover.mjs";
import { createCoverScanner } from "../src/lib/kindleCovers.mjs";
import { createApiApp } from "../server.mjs";
import { listenForTest } from "./helpers/loopback.js";
import {
  coverPng,
  epubFixture,
  mobiFixture,
  kfxFixture,
} from "./helpers/books.js";
import {
  createBackupArchive,
  restoreBackupArchive,
} from "../src/lib/backupArchive.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kc-covers-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("KFX reads clear metadata and the referenced cover, and refuses protected resources", async () => {
  const metadata = await extractBookCover(kfxFixture(), ".kfx");
  assert.equal(metadata.title, "匿名书籍");
  assert.deepEqual(metadata.authors, ["示例作者"]);
  assert.deepEqual(metadata.cover, coverPng);
  await assert.rejects(
    extractBookCover(kfxFixture({ protectedResource: true }), ".kfx"),
    /受保护/u,
  );
  const broken = kfxFixture();
  broken.writeUInt32LE(0xffffffff, 10);
  await assert.rejects(extractBookCover(broken, ".kfx"), /边界/u);
});

test("full clipping headers match source titles without website suffixes or changing authors", () => {
  const books = [
    { title: "示例书 (作者甲) (z-library.sk, 1lib.sk)", author: "作者甲" },
    { title: "另一本书", author: "作者乙" },
  ];
  const candidates = [
    {
      title: "示例书",
      authors: ["作者甲"],
      sourceTitle: "示例书 (作者甲) (z-library.sk, 1lib.sk) (作者甲)",
      url: "first",
    },
    { title: "另一本书", authors: ["作者甲"], url: "wrong-author" },
  ];
  const result = matchBookCovers(books, candidates);
  assert.deepEqual(Object.values(result.covers), ["first"]);
  assert.deepEqual(
    matchBookCovers(
      [{ title: "C++", author: "同一作者" }],
      [{ title: "C#", authors: ["同一作者"], url: "different-language" }],
    ).covers,
    {},
  );
});

test("EPUB 2/3 and unencrypted MOBI/AZW3 extract metadata and original cover bytes", async () => {
  for (const epub3 of [false, true]) {
    const result = await extractBookCover(
      await epubFixture("测试书籍", "作者甲", coverPng, epub3),
      ".epub",
    );
    assert.equal(result.title, "测试书籍");
    assert.deepEqual(result.authors, ["作者甲"]);
    assert.deepEqual(result.cover, coverPng);
  }
  for (const extension of [".mobi", ".azw", ".azw3"]) {
    const result = await extractBookCover(mobiFixture(), extension);
    assert.equal(result.title, "测试书籍");
    assert.deepEqual(result.authors, ["作者甲"]);
    assert.deepEqual(result.cover, coverPng);
  }
  assert.equal(
    (await extractBookCover(mobiFixture({ encrypted: true }), ".azw3")).cover,
    null,
  );
});

test("malformed books, oversized covers and unsafe XML are rejected without parsing text content", async () => {
  await assert.rejects(extractBookCover(Buffer.from("not a book"), ".azw3"));
  const broken = mobiFixture();
  broken.writeUInt32BE(0xffffffff, 78);
  await assert.rejects(extractBookCover(broken, ".mobi"), /边界/u);
  await assert.rejects(
    extractBookCover(
      await epubFixture("大封面", "作者", Buffer.alloc(5 * 1024 * 1024 + 1)),
      ".epub",
    ),
    /大小限制/u,
  );
  const zip = await JSZip.loadAsync(await epubFixture());
  zip.file(
    "META-INF/container.xml",
    '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///private">]><container>&x;</container>',
  );
  await assert.rejects(
    extractBookCover(await zip.generateAsync({ type: "nodebuffer" }), ".epub"),
    /XML/u,
  );
});

test("matching requires title and known author, rejects ambiguous editions and normalizes Unicode", () => {
  const candidates = [
    { title: "测试书籍", authors: ["作者甲"], url: "one" },
    { title: "测试书籍", authors: ["作者乙"], url: "two" },
    { title: "Ａ Book", authors: [" Writer "], url: "three" },
  ];
  const result = matchBookCovers(
    [
      { title: "测试书籍", author: "作者甲" },
      { title: "测试书籍", author: "" },
      { title: "测试书籍", author: "未知作者" },
      { title: "A  Book", author: "Writer" },
    ],
    candidates,
  );
  assert.deepEqual(Object.values(result.covers), ["one", "three"]);
  assert.equal(result.ambiguous, 1);
  assert.equal(
    Object.keys(
      matchBookCovers(
        [{ title: "测试书籍", author: "作者甲" }],
        [...candidates, { ...candidates[0], url: "other-edition" }],
      ).covers,
    ).length,
    0,
  );
});

test("volume scan caches unchanged books, rejects invalid KFX, serves covers and survives backup/restore", async (t) => {
  const root = await fixture(t);
  const device = path.join(root, "device");
  const documents = path.join(device, "documents", "nested");
  const media = path.join(root, "source", "media");
  await fs.mkdir(documents, { recursive: true });
  const bytes = await epubFixture();
  await fs.writeFile(path.join(documents, "book.epub"), bytes);
  await fs.writeFile(path.join(documents, "unsupported.kfx"), "not parsed");
  const scan = createCoverScanner(media, {
    roots: [device],
    platform: "linux",
  });
  const first = await scan();
  assert.equal(first.connected, true);
  assert.equal(first.unreadable, 1);
  assert.equal(first.candidates.length, 1);
  assert.deepEqual((await scan()).candidates, first.candidates);
  assert.equal(
    matchBookCovers(
      [{ title: "测试书籍", author: "作者甲" }],
      [...first.candidates, ...first.candidates],
    ).ambiguous,
    0,
  );
  assert.deepEqual(await fs.readFile(path.join(documents, "book.epub")), bytes);
  const { server, baseUrl } = await listenForTest(
    createApiApp({
      screenshotDirectory: path.join(root, "source"),
      coverOptions: { scan },
    }),
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const body = JSON.stringify({
    books: [{ title: "测试书籍", author: "作者甲" }],
  });
  const send = (extra = {}) =>
    fetch(`${baseUrl}/api/kindle-covers/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extra },
      body,
    });
  assert.equal((await send({ Origin: "https://other.example" })).status, 403);
  const payload = await (await send()).json();
  const url = Object.values(payload.covers)[0];
  assert.deepEqual(
    Buffer.from(await (await fetch(baseUrl + url)).arrayBuffer()),
    coverPng,
  );
  assert.equal(payload.candidates, undefined);
  const archive = await createBackupArchive({
    memos: [],
    settings: {
      template: "quote",
      theme: "paper",
      size: "phone",
      bookCovers: payload.covers,
    },
    screenshotDirectory: path.join(root, "source"),
    appVersion: "test",
  });
  const restored = path.join(root, "restored");
  await restoreBackupArchive({ bytes: archive, screenshotDirectory: restored });
  assert.deepEqual(
    await fs.readFile(path.join(restored, "media", url.split("/").at(-1))),
    coverPng,
  );
  await fs.writeFile(
    path.join(documents, "book.epub"),
    await epubFixture("更新书名", "作者甲"),
  );
  const updated = await scan();
  assert.deepEqual(
    updated.candidates.map((item) => item.title),
    ["更新书名"],
  );
});

test("MTP snapshots validate paths, use hidden extensions, deduplicate and preserve covers on failure", async (t) => {
  const root = await fixture(t);
  const key = createHash("sha256").update("anonymous-book").digest("hex");
  const media = path.join(root, "media");
  const runReader = async (_exe, args) => {
    await fs.access(args[args.indexOf("-File") + 1]);
    const snapshot = args[args.indexOf("-DestinationDirectory") + 1];
    const known = JSON.parse(
      await fs.readFile(args[args.indexOf("-KnownFile") + 1], "utf8"),
    );
    await fs.mkdir(path.join(snapshot, "0"));
    await fs.writeFile(
      path.join(snapshot, "0", "HiddenExtension"),
      mobiFixture(),
    );
    return {
      stdout: JSON.stringify({
        ok: true,
        connected: true,
        observed: [key],
        files: known.includes(key)
          ? []
          : [
              {
                relativePath: "0/HiddenExtension",
                extension: ".azw3",
                sourceKey: key,
              },
            ],
      }),
    };
  };
  const scan = createCoverScanner(media, {
    roots: [],
    platform: "win32",
    runReader,
  });
  assert.equal((await scan()).candidates.length, 1);
  assert.equal((await scan()).candidates.length, 1);
  assert.equal((await fs.readdir(media)).length, 1);
  const badScan = createCoverScanner(media, {
    roots: [],
    platform: "win32",
    runReader: async () => ({
      stdout: JSON.stringify({
        ok: true,
        files: [
          { relativePath: "../outside", extension: ".epub", sourceKey: key },
        ],
      }),
    }),
  });
  await assert.rejects(badScan(), /无效路径/u);
  const failed = createCoverScanner(media, {
    roots: [],
    platform: "win32",
    runReader: async () => {
      throw new Error("unavailable");
    },
  });
  await assert.rejects(failed());
  assert.equal((await fs.readdir(media)).length, 1);
});

test("MTP supports KFX file names containing ellipses and exact original clipping headers", async (t) => {
  const root = await fixture(t);
  const key = "c".repeat(64);
  const scan = createCoverScanner(path.join(root, "media"), {
    roots: [],
    platform: "win32",
    runReader: async (_exe, args) => {
      const snapshot = args[args.indexOf("-DestinationDirectory") + 1];
      const wanted = JSON.parse(
        await fs.readFile(args[args.indexOf("-WantedFile") + 1], "utf8"),
      );
      assert.equal(wanted.length, 2);
      await fs.mkdir(path.join(snapshot, "0"));
      await fs.writeFile(
        path.join(snapshot, "0", "Book...Title.kfx"),
        kfxFixture(),
      );
      return {
        stdout: JSON.stringify({
          ok: true,
          connected: true,
          observed: [key],
          files: [
            {
              relativePath: "0/Book...Title.kfx",
              extension: ".kfx",
              sourceKey: key,
              sourceName: "匿名书籍_0123456789ABCDEF.kfx",
            },
          ],
        }),
      };
    },
  });
  const books = [
    { title: "匿名书籍", author: "示例作者" },
    { title: "另一书籍", author: "其他作者" },
  ];
  const result = await scan(books);
  assert.equal(result.candidates.length, 1);
  assert.equal(
    Object.keys(matchBookCovers(books, result.candidates).covers).length,
    1,
  );
});
