import { expect, test } from "vitest";
import { bookKey, groupBooks, mergeRestoredSettings } from "../src/lib/studio";
import { normalizeSettings } from "../src/lib/storage";
import type { Memo } from "../src/types";

test("book grouping distinguishes authors and preserves a stable key across imports", () => {
  const first = { title: "同名书", author: "甲" } as Memo;
  const second = { title: "同名书", author: "乙" } as Memo;
  const grouped = groupBooks([first, second, { ...first }]);
  expect(grouped.map((book) => book.count)).toEqual([2, 1]);
  expect(grouped[0].key).toBe(bookKey(first));
  expect(grouped[0].key).not.toBe(grouped[1].key);
});

test("old settings remain valid; unsafe media references and typography are normalized", () => {
  const settings = normalizeSettings({
    template: "memo",
    theme: "paper",
    size: "square",
    background: "https://other.example/tracker.png",
    fontScale: 10,
    bookCovers: { x: "javascript:alert(1)" },
  });
  expect(settings.template).toBe("memo");
  expect(settings.fontScale).toBe(1.4);
  expect(settings.background).toBe("");
  expect(settings.bookCovers).toEqual({});
});

test("restore adds backed-up covers without replacing existing book cover choices", () => {
  const current = { ...normalizeSettings({}), bookCovers: { x: "current" } };
  const incoming = {
    ...normalizeSettings({}),
    bookCovers: { x: "old", y: "new" },
  };
  expect(mergeRestoredSettings(current, incoming).bookCovers).toEqual({
    x: "current",
    y: "new",
  });
});
