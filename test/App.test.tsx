import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";
import {
  loadSettings,
  saveSettings,
  parseStoredMemos,
  STORAGE_KEY,
} from "../src/lib/storage";
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

  test("automatically fills missing covers, saves them, and keeps manual cover choices", async () => {
    const second = { ...memo, id: "second-book", title: "另一本书" };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([memo, second]));
    const manual = `/api/media/${"a".repeat(64)}.png`;
    const automatic = `/api/media/${"b".repeat(64)}.jpg`;
    const originalKey = JSON.stringify([memo.title, memo.author]);
    const secondKey = JSON.stringify([second.title, second.author]);
    saveSettings({ ...loadSettings(), bookCovers: { [originalKey]: manual } });
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (url === "/api/kindle-covers/scan") {
        expect(JSON.parse(String(options?.body)).books).toEqual([
          { title: second.title, author: second.author },
        ]);
        return new Response(
          JSON.stringify({
            ok: true,
            connected: true,
            covers: { [originalKey]: automatic, [secondKey]: automatic },
          }),
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    const view = render(<App />);
    expect(await screen.findByText("已从 Kindle 补齐 1 本封面。")).toBeTruthy();
    await waitFor(() =>
      expect(loadSettings().bookCovers).toEqual({
        [originalKey]: manual,
        [secondKey]: automatic,
      }),
    );
    expect(
      view.container.querySelector(`.bookShelf img[src="${automatic}"]`),
    ).toBeTruthy();
    expect(
      view.container.querySelector(`.bookShelf img[src="${manual}"]`),
    ).toBeTruthy();
  });

  test("loads, edits, persists, and copies a memo through the primary workflow", async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "测试书名，作者甲，1 条摘录" }),
    );
    expect(screen.getByRole("heading", { name: "1 条内容" })).toBeTruthy();
    const comment = screen.getByRole("textbox", { name: "评论" });
    await user.clear(comment);
    await user.type(comment, "更新后的评论。");

    const stored = parseStoredMemos(
      window.localStorage.getItem(STORAGE_KEY) || "",
    ).memos;
    expect(stored[0].comment).toBe("更新后的评论。");

    await user.click(screen.getByRole("button", { name: "复制笔记文本" }));
    expect(clipboardSpy).toHaveBeenCalledWith(
      "一句值得保留的摘录。\n\n更新后的评论。\n\n《测试书名》 作者甲\n\n#写作",
    );
    expect(
      await screen.findByText("笔记文本已复制，可以直接粘贴。"),
    ).toBeTruthy();
  });

  test("opens on the shelf, searches quotes, changes layout and returns from a book without losing edits", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        memo,
        {
          ...memo,
          id: "second",
          title: "另一本书",
          author: "作者乙",
          quote: "只有这里包含检索线索。",
        },
      ]),
    );
    render(<App />);
    expect(screen.getByRole("heading", { name: "我的书架" })).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: "搜索书架" }),
      "检索线索",
    );
    expect(
      screen.queryByRole("button", { name: "测试书名，作者甲，1 条摘录" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "列表显示" }));
    expect(
      screen
        .getByRole("button", { name: "列表显示" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(
      screen.getByRole("button", { name: "另一本书，作者乙，1 条摘录" }),
    );
    const comment = screen.getByRole("textbox", { name: "评论" });
    await user.clear(comment);
    await user.type(comment, "从书架进入后修改");
    await user.click(screen.getByRole("button", { name: "我的书架" }));
    expect(
      (screen.getByRole("textbox", { name: "搜索书架" }) as HTMLInputElement)
        .value,
    ).toBe("检索线索");
    await user.clear(screen.getByRole("textbox", { name: "搜索书架" }));
    expect(screen.getByRole("region", { name: "本次打开" })).toBeTruthy();
    expect(
      parseStoredMemos(
        window.localStorage.getItem(STORAGE_KEY) || "",
      ).memos.find((item) => item.id === "second")?.comment,
    ).toBe("从书架进入后修改");
    await user.click(
      within(screen.getByRole("navigation", { name: "资料导航" })).getByRole(
        "button",
        { name: "截图" },
      ),
    );
    expect(
      screen.getByText("备份与恢复", { selector: "summary" }),
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
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "资料导航" })).getByRole(
        "button",
        { name: "全部摘录" },
      ),
    );
    expect(screen.getByRole("heading", { name: "2 条内容" })).toBeTruthy();
    const stored = parseStoredMemos(
      window.localStorage.getItem(STORAGE_KEY) || "",
    ).memos;
    expect(stored.some((item) => item.id === incoming.id)).toBe(true);
  });
  test("filters same-title books by author and persists Studio typography", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        memo,
        {
          ...memo,
          id: "other-author",
          author: "作者乙",
          quote: "另一本同名书的摘录。",
        },
      ]),
    );
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "测试书名，作者乙，1 条摘录" }),
    );
    expect(screen.getByRole("heading", { name: "1 条结果" })).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "摘录" }).getAttribute("value") ||
        (screen.getByRole("textbox", { name: "摘录" }) as HTMLTextAreaElement)
          .value,
    ).toBe("另一本同名书的摘录。");
    await user.click(screen.getByText("字体、布局与背景"));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "字体" }),
      "serif",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "文字大小" }),
      "1.2",
    );
    const settings = JSON.parse(
      window.localStorage.getItem("kindle-cards:settings") || "{}",
    );
    expect(settings.font).toBe("serif");
    expect(settings.fontScale).toBe(1.2);
    await user.click(screen.getByRole("button", { name: "书页" }));
    expect(
      JSON.parse(window.localStorage.getItem("kindle-cards:settings") || "{}")
        .template,
    ).toBe("editorial");
  });
});
