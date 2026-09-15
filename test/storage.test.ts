import { describe, expect, test } from "vitest";
import {
  normalizeTags,
  parseStoredMemos,
  saveMemos,
  STORAGE_KEY,
} from "../src/lib/storage";

describe("storage validation", () => {
  test("a later synchronization cannot replace malformed source storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{damaged");
    expect(saveMemos([]).ok).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{damaged");
  });
  test("keeps valid memos and skips malformed records", () => {
    const result = parseStoredMemos(
      JSON.stringify([
        {
          id: "memo-1",
          title: "书名",
          author: "作者",
          quote: "摘录",
          comment: "",
          tags: ["写作", "写作", ""],
          locationStart: 1,
          locationEnd: 2,
          page: "",
          addedAtRaw: "",
        },
        { title: "缺少 id" },
      ]),
    );

    expect(result.memos).toHaveLength(1);
    expect(result.memos[0].tags).toEqual(["写作"]);
    expect(result.warning).toContain("1 条无效记录");
  });

  test("normalizes tags to unique non-empty strings", () => {
    expect(normalizeTags([" 写作 ", "写作", 42, "", "心理学"])).toEqual([
      "写作",
      "心理学",
    ]);
  });

  test("rejects a stale window instead of overwriting a newer save", () => {
    window.localStorage.clear();
    const original = {
      id: "memo-1",
      title: "书名",
      author: "作者",
      quote: "摘录",
      comment: "原评论",
      tags: [],
      locationStart: 1,
      locationEnd: 2,
      page: "",
      addedAtRaw: "",
    };
    const first = saveMemos([original]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const staleRevision = first.revision;
    const newer = saveMemos(
      [{ ...original, comment: "窗口 A 的修改" }],
      staleRevision,
    );
    expect(newer.ok).toBe(true);
    const stale = saveMemos([{ ...original, tags: ["窗口B"] }], staleRevision);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.conflict).toBe(true);
    expect(
      parseStoredMemos(window.localStorage.getItem(STORAGE_KEY) || "").memos[0]
        .comment,
    ).toBe("窗口 A 的修改");
  });
});
