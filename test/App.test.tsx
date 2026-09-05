import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import { STORAGE_KEY } from "../src/lib/storage";
import type { Memo } from "../src/types";

const memo: Memo = {
  id: "book|author|12|13|quote",
  title: "测试书名",
  author: "作者甲",
  type: "highlight",
  quote: "一句值得保留的摘录。",
  comment: "原始评论。",
  tags: ["写作"],
  locationStart: 12,
  locationEnd: 13,
  page: "",
  addedAtRaw: "2026年6月9日",
  importedAt: "2026-06-09T10:00:00.000Z",
  favorite: false,
};

describe("App", () => {
  beforeEach(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn() },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: false, message: "Kindle not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([memo]));
  });

  test("loads, edits, persists, and copies a memo through the primary workflow", async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");
    render(<App />);

    expect(screen.getByRole("heading", { name: "1 条内容" })).toBeTruthy();
    const comment = screen.getByRole("textbox", { name: "评论" });
    await user.clear(comment);
    await user.type(comment, "更新后的评论。");

    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "[]",
    ) as Memo[];
    expect(stored[0].comment).toBe("更新后的评论。");

    await user.click(screen.getByRole("button", { name: "复制笔记文本" }));
    expect(clipboardSpy).toHaveBeenCalledWith(
      "一句值得保留的摘录。\n\n更新后的评论。\n\n《测试书名》 作者甲\n\n#写作",
    );
    expect(
      await screen.findByText("笔记文本已复制，可以直接粘贴。"),
    ).toBeTruthy();
  });

  test("reports malformed local data without overwriting it", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    render(<App />);

    expect(screen.getByRole("alert").textContent).toContain("原始内容未被覆盖");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{not valid json");
  });

  test("automatically merges Kindle changes while the page is open", async () => {
    const incoming: Memo = {
      ...memo,
      id: "new-book|author|21|22|new-quote",
      title: "新书",
      quote: "刚从 Kindle 同步的摘录。",
      locationStart: 21,
      locationEnd: 22,
    };
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        new Response(
          String(url).startsWith("/api/screenshots")
            ? JSON.stringify({ ok: true, items: [], connected: false })
            : JSON.stringify({
                ok: true,
                changed: true,
                source: "Kindle Paperwhite / My Clippings.txt",
                transport: "mtp",
                revision: "new-revision",
                importedAt: "2026-09-03T07:00:00.000Z",
                memos: [incoming],
              }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    render(<App />);

    expect(
      await screen.findByText(/Kindle Paperwhite.*已自动同步/u),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2 条内容" })).toBeTruthy();
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "[]",
    ) as Memo[];
    expect(stored.some((item) => item.id === incoming.id)).toBe(true);
  });
});
