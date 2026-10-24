import { BookOpen, Grid2X2, List } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { groupBooks, uploadMedia } from "../lib/studio";
import type { Memo } from "../types";

export function BookShelf({
  expanded = false,
  search = "",
  recentKeys = [],
  memos,
  selected,
  covers,
  onSelect,
  onCover,
  onAutoCovers,
}: {
  expanded?: boolean;
  search?: string;
  recentKeys?: string[];
  memos: Memo[];
  selected: string;
  covers: Record<string, string>;
  onSelect: (key: string) => void;
  onCover: (key: string, url: string) => void;
  onAutoCovers: (covers: Record<string, string>) => void;
}) {
  const books = groupBooks(memos);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const needle = search.trim().toLocaleLowerCase();
  const visibleBooks = books.filter(
    (book) =>
      !expanded ||
      !needle ||
      memos.some(
        (memo) =>
          JSON.stringify([memo.title.trim(), memo.author.trim()]) ===
            book.key &&
          `${memo.title} ${memo.author} ${memo.quote}`
            .toLocaleLowerCase()
            .includes(needle),
      ),
  );
  const recentBooks = recentKeys
    .map((key) => books.find((book) => book.key === key))
    .filter((book) => book !== undefined);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [coverStatus, setCoverStatus] = useState("");
  const latest = useRef({ covers, onAutoCovers });
  useEffect(() => {
    latest.current = { covers, onAutoCovers };
  });
  const signature = JSON.stringify(
    books.map(({ title, author }) => ({ title, author })),
  );
  const scanInFlight = useRef(false);
  const activeScan = useRef<AbortController | null>(null);
  const batchOffset = useRef(0);
  const pendingScan = useRef(false);
  const lastScanAt = useRef(0);
  const scanCovers = useCallback(
    async (signal: AbortSignal, manual = false) => {
      if (scanInFlight.current) return;
      const missing = (
        JSON.parse(signature) as { title: string; author: string }[]
      ).filter(
        (book) =>
          !latest.current.covers[
            JSON.stringify([book.title.trim(), book.author.trim()])
          ],
      );
      if (!missing.length) {
        if (manual) setCoverStatus("已有书籍均已设置封面。");
        return;
      }
      scanInFlight.current = true;
      lastScanAt.current = Date.now();
      setScanning(true);
      const controller = new AbortController();
      activeScan.current = controller;
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timeout = window.setTimeout(abort, 40_000);
      const offset =
        batchOffset.current < missing.length ? batchOffset.current : 0;
      const batch = missing.slice(offset, offset + 500);
      batchOffset.current = offset + 500;
      try {
        const response = await fetch("/api/kindle-covers/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ books: batch }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (signal.aborted) return;
        if (!response.ok || !result.ok)
          throw new Error(result.message || "封面同步失败，请重试。");
        pendingScan.current = Boolean(result.pending);
        const found = Object.fromEntries(
          Object.entries(result.covers || {}).filter(
            ([key, url]) =>
              missing.some(
                (book) =>
                  JSON.stringify([book.title.trim(), book.author.trim()]) ===
                  key,
              ) &&
              typeof url === "string" &&
              /^\/api\/media\/[a-f0-9]{64}\.(png|jpg)$/.test(url),
          ),
        ) as Record<string, string>;
        latest.current.onAutoCovers(found);
        const count = Object.keys(found).length;
        if (count)
          setCoverStatus(
            `已从 Kindle 补齐 ${count} 本封面。${result.pending ? "其余书籍将在后续扫描中继续读取。" : ""}`,
          );
        else if (manual || result.connected)
          setCoverStatus(
            !result.connected
              ? "请连接 Kindle 后重试；也可以上传封面。"
              : result.pending
                ? "正在分批读取电子书，稍后会继续补齐封面。"
                : result.ambiguous
                  ? "部分书籍版本不明确，请手动上传封面。"
                  : `已有 ${Object.keys(latest.current.covers).length} 本封面；其余 ${missing.length} 本暂未找到可读取且能可靠匹配的封面，可手动上传。`,
          );
      } catch (error) {
        pendingScan.current = false;
        if (!signal.aborted)
          setCoverStatus(
            controller.signal.aborted
              ? "封面读取超时，稍后会重试。"
              : error instanceof Error
                ? error.message
                : "封面同步失败，请重试。",
          );
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        activeScan.current = null;
        scanInFlight.current = false;
        setScanning(false);
      }
    },
    [signature],
  );
  useEffect(() => {
    const controller = new AbortController();
    const scan = () => {
      if (!document.hidden) void scanCovers(controller.signal);
    };
    scan();
    const timer = window.setInterval(() => {
      if (pendingScan.current || Date.now() - lastScanAt.current >= 60_000)
        scan();
    }, 5_000);
    document.addEventListener("visibilitychange", scan);
    return () => {
      controller.abort();
      activeScan.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", scan);
    };
  }, [scanCovers]);
  const current = books.find((book) => book.key === selected);
  if (!books.length) return null;
  return (
    <section
      className={`bookShelf ${expanded ? `expandedShelf layout-${layout}` : ""}`}
      aria-label="按书籍浏览"
    >
      <div className="bookShelfHeading">
        <strong>
          {expanded ? "全部书籍" : "我的书籍"}{" "}
          <span>{expanded ? visibleBooks.length : books.length}</span>
        </strong>
        <button
          type="button"
          className="quietButton"
          disabled={scanning}
          onClick={() => void scanCovers(new AbortController().signal, true)}
        >
          {scanning ? "正在读取封面…" : "从 Kindle 补齐封面"}
        </button>
        <button
          className="quietButton"
          aria-pressed={!selected}
          onClick={() => onSelect("")}
        >
          全部摘录
        </button>
      </div>
      {coverStatus && <p role="status">{coverStatus}</p>}
      {expanded && (
        <div className="shelfViewToggle" role="group" aria-label="书架显示方式">
          <button
            aria-label="网格显示"
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            <Grid2X2 size={18} aria-hidden="true" />
          </button>
          <button
            aria-label="列表显示"
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {expanded && !needle && recentBooks.length > 0 && (
        <section className="recentBooks" aria-label="本次打开">
          <h3>本次打开</h3>
          <div>
            {recentBooks.map((book) => (
              <button key={book.key} onClick={() => onSelect(book.key)}>
                {covers[book.key] ? (
                  <img src={covers[book.key]} alt="" />
                ) : (
                  <BookOpen size={28} aria-hidden="true" />
                )}
                <span>
                  <strong>{book.title}</strong>
                  <small>{book.author || "作者未注明"}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="bookShelfList">
        {(expanded ? visibleBooks : books).map((book) => (
          <button
            className={`shelfBook ${selected === book.key ? "active" : ""}`}
            key={book.key}
            title={`${book.title} · ${book.author || "作者未注明"}`}
            aria-label={`${book.title}，${book.author || "作者未注明"}，${book.count} 条摘录`}
            aria-pressed={selected === book.key}
            onClick={() => onSelect(book.key)}
          >
            {covers[book.key] ? (
              <img src={covers[book.key]} alt="" />
            ) : (
              <span className="bookPlaceholder" aria-hidden="true">
                <BookOpen size={28} />
              </span>
            )}
            <strong>{book.title}</strong>
            <span>{book.author || "作者未注明"}</span>
            <small>{book.count} 条摘录</small>
          </button>
        ))}
      </div>
      {expanded && !visibleBooks.length && (
        <p className="shelfNoResults" role="status">
          没有找到匹配的书籍。试试其他书名、作者或摘录关键词。
        </p>
      )}
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
