import assert from "node:assert/strict";
import test from "node:test";
import { mergeMemos, parseKindleClippings } from "../src/lib/kindleParser.js";

test("parses Chinese Kindle highlights and merges the matching note", () => {
  const clippings = `中文书名（作者甲）
- 您在位置 123-124的标注 | 添加于 2026年6月9日星期二 下午10:00:00

这是一段值得分享的中文摘录。它应该在卡片里保持清晰、克制、有留白。
==========
中文书名（作者甲）
- 您在位置 124的笔记 | 添加于 2026年6月9日星期二 下午10:01:00

#写作 #心理学 这句话适合放进文章开头。
==========`;

  const memos = parseKindleClippings(clippings);

  assert.equal(memos.length, 1);
  assert.equal(memos[0].title, "中文书名");
  assert.equal(memos[0].author, "作者甲");
  assert.equal(
    memos[0].quote,
    "这是一段值得分享的中文摘录。它应该在卡片里保持清晰、克制、有留白。",
  );
  assert.equal(memos[0].comment, "这句话适合放进文章开头。");
  assert.deepEqual(memos[0].tags, ["写作", "心理学"]);
});

test("cleans a near-time Kindle note editing sequence and keeps the best complete comment", () => {
  const clippings = `故事（作者）
- Your Highlight on page 12 | Location 116-117 | Added on Tuesday, June 9, 2026 10:00:00 PM

观众不仅令人惊叹地敏感，而且一旦他们在黑暗的影院坐定，集体智商就能瞬间跃升。
==========
故事（作者）
- Your Note on page 12 | Location 117 | Added on Tuesday, June 9, 2026 10:00:10 PM

dadi
==========
故事（作者）
- Your Note on page 12 | Location 117 | Added on Tuesday, June 9, 2026 10:00:18 PM

大抵是因为购票了抱着审视的眼光去看的原因。
==========
故事（作者）
- Your Note on page 12 | Location 117 | Added on Tuesday, June 9, 2026 10:00:28 PM

大抵是因为购票了抱着shen
==========`;

  const memos = parseKindleClippings(clippings);

  assert.equal(memos.length, 1);
  assert.equal(memos[0].comment, "大抵是因为购票了抱着审视的眼光去看的原因。");
});

test("merge updates an existing memo instead of appending duplicate drafts", () => {
  const existing = parseKindleClippings(`书（作者）
- Your Highlight on Location 10-11 | Added on Tuesday, June 9, 2026 10:00:00 PM

一句话。
==========`);
  const incoming = [
    {
      ...existing[0],
      comment: "后补评论",
      tags: ["整理"],
    },
  ];

  const result = mergeMemos(existing, incoming, "2026-06-24T00:00:00.000Z");

  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.memos.length, 1);
  assert.equal(result.memos[0].comment, "后补评论");
  assert.deepEqual(result.memos[0].tags, ["整理"]);
});

test("merge keeps a standalone note stable when its text is edited on Kindle", () => {
  const existing = parseKindleClippings(`书（作者）
- Your Note on Location 44 | Added on Tuesday, June 9, 2026 10:00:00 PM

第一版想法。
==========`);
  const incoming = parseKindleClippings(`书（作者）
- Your Note on Location 44 | Added on Tuesday, June 9, 2026 10:05:00 PM

#整理 第二版完整想法。
==========`);

  const result = mergeMemos(existing, incoming, "2026-06-24T00:00:00.000Z");

  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.memos.length, 1);
  assert.equal(result.memos[0].comment, "第二版完整想法。");
  assert.deepEqual(result.memos[0].tags, ["整理"]);
});

test("parses CRLF input, full-width author brackets, and em-dash locations", () => {
  const clippings = [
    "书名（作者甲）",
    "- 您在位置 20—22的标注 | 添加于 2026年8月1日星期六 下午8:00:00",
    "",
    "一段跨平台换行的摘录。",
    "==========",
  ].join("\r\n");

  const memos = parseKindleClippings(clippings);

  assert.equal(memos.length, 1);
  assert.equal(memos[0].author, "作者甲");
  assert.equal(memos[0].locationStart, 20);
  assert.equal(memos[0].locationEnd, 22);
});

test("re-importing identical content is a no-op and keeps user metadata", () => {
  const incoming = parseKindleClippings(`书（作者）
- Your Highlight on Location 88 | Added on Tuesday, June 9, 2026 10:00:00 PM

同一条摘录。
==========`);
  const existing = [
    { ...incoming[0], importedAt: "2026-06-09T00:00:00.000Z", favorite: true },
  ];

  const result = mergeMemos(existing, incoming, "2026-09-01T00:00:00.000Z");

  assert.equal(result.added, 0);
  assert.equal(result.updated, 0);
  assert.equal(result.memos.length, 1);
  assert.equal(result.memos[0].favorite, true);
  assert.equal(result.memos[0].importedAt, "2026-06-09T00:00:00.000Z");
});
