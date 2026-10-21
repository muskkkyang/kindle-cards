import { useState } from "react";
import { groupBooks, uploadMedia } from "../lib/studio";
import type { Memo } from "../types";

export function BookShelf({
  memos,
  selected,
  covers,
  onSelect,
  onCover,
}: {
  memos: Memo[];
  selected: string;
  covers: Record<string, string>;
  onSelect: (key: string) => void;
  onCover: (key: string, url: string) => void;
}) {
  const books = groupBooks(memos);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const current = books.find((book) => book.key === selected);
  if (!books.length) return null;
  return (
    <section className="bookShelf" aria-label="按书籍浏览">
      <div className="bookShelfHeading">
        <strong>
          我的书籍 <span>{books.length}</span>
        </strong>
        <button
          className="quietButton"
          aria-pressed={!selected}
          onClick={() => onSelect("")}
        >
          全部摘录
        </button>
      </div>
      <div className="bookShelfList">
        {books.map((book) => (
          <button
            className={`shelfBook ${selected === book.key ? "active" : ""}`}
            key={book.key}
            aria-label={`${book.title}，${book.author || "作者未注明"}，${book.count} 条摘录`}
            aria-pressed={selected === book.key}
            onClick={() => onSelect(book.key)}
          >
            {covers[book.key] ? (
              <img src={covers[book.key]} alt="" />
            ) : (
              <span className="bookPlaceholder" aria-hidden="true">
                {book.title.slice(0, 8)}
              </span>
            )}
            <strong>{book.title}</strong>
            <span>{book.author || "作者未注明"}</span>
            <small>{book.count} 条摘录</small>
          </button>
        ))}
      </div>
      {current && (
        <div className="bookCoverAction">
          <span>{current.title}</span>
          <label className="quietButton">
            {busy ? "正在保存…" : "上传封面"}
            <input
              className="srOnly"
              type="file"
              aria-label="上传书籍封面"
              accept="image/png,image/jpeg"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                setMessage("");
                try {
                  onCover(current.key, await uploadMedia(file));
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "封面保存失败。",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
