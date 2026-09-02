import assert from "node:assert/strict";
import test from "node:test";
import { formatMemoText } from "../src/lib/memoFormat.js";

test("formats a Kindle memo as portable plain text", () => {
  const text = formatMemoText({
    quote: "一句值得保留的话。",
    comment: "这是我的评论。",
    title: "中文书名",
    author: "作者甲",
    tags: ["写作", "心理学"],
  });

  assert.equal(
    text,
    "一句值得保留的话。\n\n这是我的评论。\n\n《中文书名》 作者甲\n\n#写作 #心理学",
  );
});
