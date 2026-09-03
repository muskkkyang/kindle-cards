import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CircleAlert,
  Copy,
  Download,
  FileUp,
  HardDrive,
  Hash,
  ImageDown,
  Library,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Tags,
  Upload,
} from "lucide-react";
import { CardPreview } from "./components/CardPreview";
import {
  compactTitle,
  formatLocation,
  getCardDimensions,
  getRecentCutoff,
  safeFileStem,
  sizePresets,
} from "./lib/cardUtils";
import { formatMemoText } from "./lib/memoFormat.js";
import { mergeMemos, parseKindleClippings } from "./lib/kindleParser.js";
import {
  loadMemos,
  loadSettings,
  normalizeTags,
  saveMemos,
  saveSettings,
} from "./lib/storage";
import type {
  AppSettings,
  AppStatus,
  FilterMode,
  Memo,
  MobileView,
  SizePreset,
  Template,
  Theme,
} from "./types";

const EXPORT_PIXEL_RATIO = 3;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_EXPORT = 50;
const AUTO_SYNC_INTERVAL_MS = 5_000;

type KindlePayload = {
  ok?: boolean;
  changed?: boolean;
  message?: string;
  memos?: Memo[];
  importedAt?: string;
  source?: string;
  revision?: string;
  transport?: "mtp" | "volume";
};

async function fetchKindleClippings(signal: AbortSignal, revision = "") {
  const query = revision ? `?revision=${encodeURIComponent(revision)}` : "";
  const response = await fetch(`/api/kindle-clippings${query}`, { signal });
  const payload = (await response.json()) as KindlePayload;
  return { response, payload };
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function App() {
  const initialData = useMemo(() => loadMemos(), []);
  const [memos, setMemos] = useState<Memo[]>(initialData.memos);
  const [selectedId, setSelectedId] = useState(
    () => initialData.memos[0]?.id || "",
  );
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [status, setStatus] = useState<AppStatus>(() =>
    initialData.warning
      ? { tone: "error", text: initialData.warning }
      : { tone: "neutral", text: "阅读数据只保存在这台电脑。" },
  );
  const [pasteText, setPasteText] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("library");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteDetailsRef = useRef<HTMLDetailsElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const memosRef = useRef<Memo[]>(initialData.memos);
  const syncInFlightRef = useRef(false);
  const lastKindleRevisionRef = useRef("");
  const kindleWasConnectedRef = useRef<boolean | null>(null);

  const { template, theme, size } = settings;

  useEffect(() => {
    const result = saveSettings(settings);
    if (!result.ok) setStatus({ tone: "error", text: result.message });
  }, [settings]);

  useEffect(
    () => () => {
      if (copyTimerRef.current != null)
        window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let activeController: AbortController | null = null;

    async function pollKindle() {
      if (disposed || document.hidden || syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      activeController = new AbortController();
      const timeout = window.setTimeout(
        () => activeController?.abort(),
        12_000,
      );

      try {
        const { response, payload } = await fetchKindleClippings(
          activeController.signal,
          lastKindleRevisionRef.current,
        );
        if (disposed) return;

        if (response.status === 404) {
          if (kindleWasConnectedRef.current !== false) {
            kindleWasConnectedRef.current = false;
            setStatus({
              tone: "neutral",
              text: "正在等待 Kindle 连接；连接后会自动同步新摘录。",
            });
          }
          return;
        }
        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "自动检测 Kindle 失败。");
        }

        const connectionChanged = kindleWasConnectedRef.current !== true;
        kindleWasConnectedRef.current = true;
        if (payload.revision) lastKindleRevisionRef.current = payload.revision;

        if (payload.changed === false) {
          if (connectionChanged) {
            setStatus({
              tone: "success",
              text: "Kindle 已连接，正在自动监测新摘录。",
            });
          }
          return;
        }
        if (!Array.isArray(payload.memos) || payload.memos.length === 0) {
          setStatus({
            tone: "neutral",
            text: "Kindle 已连接，但 My Clippings.txt 中还没有可同步的摘录。",
          });
          return;
        }

        const importedAt = payload.importedAt || new Date().toISOString();
        const result = mergeMemos(
          memosRef.current,
          payload.memos,
          importedAt,
        ) as { memos: Memo[]; added: number; updated: number };
        memosRef.current = result.memos;
        setMemos(result.memos);
        setSelectedId((current) => current || result.memos[0]?.id || "");
        const saveResult = saveMemos(result.memos);
        setStatus(
          saveResult.ok
            ? {
                tone: "success",
                text: `${payload.source || "Kindle"} 已自动同步：新增 ${result.added} 条，更新 ${result.updated} 条，共 ${result.memos.length} 条。`,
              }
            : { tone: "error", text: saveResult.message },
        );
      } catch (error) {
        if (
          !disposed &&
          !(error instanceof DOMException && error.name === "AbortError") &&
          kindleWasConnectedRef.current !== false
        ) {
          kindleWasConnectedRef.current = false;
          setStatus({
            tone: "error",
            text: "Kindle 自动检测暂时失败，将继续重试。",
          });
        }
      } finally {
        window.clearTimeout(timeout);
        activeController = null;
        syncInFlightRef.current = false;
      }
    }

    function pollWhenVisible() {
      if (!document.hidden) void pollKindle();
    }

    void pollKindle();
    const interval = window.setInterval(pollKindle, AUTO_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", pollWhenVisible);
    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", pollWhenVisible);
    };
  }, []);

  const selectedMemo = useMemo(
    () => memos.find((memo) => memo.id === selectedId) || memos[0],
    [memos, selectedId],
  );

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    memos.forEach((memo) =>
      memo.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)),
    );
    return Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"),
    );
  }, [memos]);

  const books = useMemo(
    () => new Set(memos.map((memo) => memo.title)).size,
    [memos],
  );
  const recentCutoff = useMemo(() => getRecentCutoff(memos), [memos]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return memos.filter((memo) => {
      const haystack = [
        memo.quote,
        memo.comment,
        memo.title,
        memo.author,
        ...memo.tags,
      ]
        .join(" ")
        .toLocaleLowerCase("zh-CN");
      if (needle && !haystack.includes(needle)) return false;
      if (activeTag && !memo.tags.includes(activeTag)) return false;
      if (filterMode === "untagged" && memo.tags.length > 0) return false;
      if (filterMode === "recent")
        return (Date.parse(memo.importedAt || "") || 0) === recentCutoff;
      return true;
    });
  }, [activeTag, filterMode, memos, query, recentCutoff]);

  function persist(nextMemos: Memo[]) {
    memosRef.current = nextMemos;
    setMemos(nextMemos);
    if (!selectedId && nextMemos[0]) setSelectedId(nextMemos[0].id);
    return saveMemos(nextMemos);
  }

  function changeSetting<Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function importParsed(
    parsed: Memo[],
    importedAt = new Date().toISOString(),
    source = "文件",
  ) {
    if (parsed.length === 0) {
      setStatus({
        tone: "error",
        text: `${source} 中没有识别到 Kindle 摘录，请确认文件内容。`,
      });
      return;
    }

    const result = mergeMemos(memos, parsed, importedAt) as {
      memos: Memo[];
      added: number;
      updated: number;
    };
    const saveResult = persist(result.memos);
    setFilterMode("recent");
    setActiveTag("");
    const affected = result.memos.find(
      (memo) => memo.importedAt === importedAt,
    );
    setSelectedId(affected?.id || result.memos[0]?.id || "");
    setStatus(
      saveResult.ok
        ? {
            tone: "success",
            text: `${source} 已完成：新增 ${result.added} 条，更新 ${result.updated} 条，共 ${result.memos.length} 条。`,
          }
        : { tone: "error", text: saveResult.message },
    );
  }

  async function syncKindle() {
    if (syncInFlightRef.current) {
      setStatus({ tone: "working", text: "正在检测 Kindle，请稍候..." });
      return;
    }
    syncInFlightRef.current = true;
    setIsSyncing(true);
    setStatus({ tone: "working", text: "正在查找通过 USB 连接的 Kindle..." });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const { response, payload } = await fetchKindleClippings(
        controller.signal,
      );
      if (!response.ok || !payload.ok || !Array.isArray(payload.memos)) {
        throw new Error(payload.message || "同步失败。");
      }
      kindleWasConnectedRef.current = true;
      if (payload.revision) lastKindleRevisionRef.current = payload.revision;
      importParsed(
        payload.memos,
        payload.importedAt,
        payload.source || "Kindle",
      );
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "查找 Kindle 超时，请重新连接设备或改用导入文件。"
          : error instanceof Error
            ? error.message
            : "没有找到 Kindle，请改用导入文件。";
      setStatus({ tone: "error", text: message });
    } finally {
      window.clearTimeout(timeout);
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  }

  async function importFile(file: File) {
    const isTextFile =
      file.name.toLocaleLowerCase().endsWith(".txt") ||
      file.type === "text/plain" ||
      !file.type;
    if (!isTextFile) {
      setStatus({
        tone: "error",
        text: "请选择 Kindle 的 My Clippings.txt 文本文件。",
      });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus({
        tone: "error",
        text: "文件超过 25 MB。请确认选择的是 Kindle 摘录文本。",
      });
      return;
    }

    try {
      setStatus({ tone: "working", text: `正在解析 ${file.name}...` });
      const text = await file.text();
      importParsed(
        parseKindleClippings(text) as Memo[],
        new Date().toISOString(),
        file.name,
      );
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "文件读取失败。",
      });
    }
  }

  function updateMemo(id: string, changes: Partial<Memo>) {
    const nextMemos = memos.map((memo) =>
      memo.id === id ? { ...memo, ...changes } : memo,
    );
    const result = persist(nextMemos);
    if (!result.ok) setStatus({ tone: "error", text: result.message });
  }

  async function waitForCard(memoId: string) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await nextPaint();
      if (cardRef.current?.dataset.memoId === memoId) return;
    }
    throw new Error("卡片预览未及时更新，请重试。");
  }

  async function captureCard(memo: Memo) {
    const card = cardRef.current;
    if (!card) throw new Error("卡片预览尚未准备好。");

    const dimensions = getCardDimensions(
      size,
      template,
      memo.quote || memo.comment || "",
      memo.comment || "",
    );
    const previousTransform = card.style.transform;
    card.style.transform = "none";

    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(card, {
        cacheBust: true,
        pixelRatio: EXPORT_PIXEL_RATIO,
        width: dimensions.width,
        height: dimensions.height,
        style: {
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
        },
      });
      if (!blob) throw new Error("浏览器没有生成可下载的图片。");
      return blob;
    } finally {
      card.style.transform = previousTransform;
    }
  }

  async function exportCard() {
    if (!selectedMemo || isExporting) return;
    setIsExporting(true);
    try {
      await waitForCard(selectedMemo.id);
      const blob = await captureCard(selectedMemo);
      downloadBlob(
        blob,
        `${safeFileStem(selectedMemo.title)}-${Date.now()}.png`,
      );
      setStatus({ tone: "success", text: "卡片 PNG 已导出。" });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "卡片导出失败。",
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function exportBatch() {
    if (filtered.length === 0 || isExporting) return;
    const originalId = selectedMemo?.id || "";
    const originalMobileView = mobileView;
    const batch = filtered.slice(0, MAX_BATCH_EXPORT);
    setIsExporting(true);
    setMobileView("studio");
    setStatus({
      tone: "working",
      text: `正在整理 ${batch.length} 张卡片到一个 ZIP 文件...`,
    });

    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const [index, memo] of batch.entries()) {
        setSelectedId(memo.id);
        await waitForCard(memo.id);
        const blob = await captureCard(memo);
        const order = String(index + 1).padStart(2, "0");
        zip.file(`${order}-${safeFileStem(memo.title)}.png`, blob);
      }

      const archive = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      downloadBlob(archive, `kindle-cards-${Date.now()}.zip`);
      const suffix =
        filtered.length > MAX_BATCH_EXPORT
          ? `，已按安全上限导出前 ${MAX_BATCH_EXPORT} 张`
          : "";
      setStatus({
        tone: "success",
        text: `已导出 ${batch.length} 张卡片${suffix}。`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "批量导出中断，请重试。",
      });
    } finally {
      setSelectedId(originalId);
      setMobileView(originalMobileView);
      setIsExporting(false);
    }
  }

  async function copyMemoText() {
    if (!selectedMemo) return;
    const text = formatMemoText(selectedMemo);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied =
          typeof document.execCommand === "function" &&
          document.execCommand("copy");
        textarea.remove();
        if (!copied)
          throw new Error("浏览器未允许复制，请手动复制编辑区内容。");
      }

      setDidCopy(true);
      setStatus({
        tone: "success",
        text: "笔记文本已复制，可以直接粘贴。",
      });
      if (copyTimerRef.current != null)
        window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setDidCopy(false), 1_800);
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "复制失败，请重试。",
      });
    }
  }

  const statusRole = status.tone === "error" ? "alert" : "status";
  const StatusIcon =
    status.tone === "success"
      ? Check
      : status.tone === "error"
        ? CircleAlert
        : status.tone === "working"
          ? RefreshCw
          : HardDrive;

  return (
    <main
      className={`appShell mobile-${mobileView}`}
      aria-busy={isSyncing || isExporting}
    >
      <header className="appHeader">
        <div className="brandLockup">
          <span className="brandIcon" aria-hidden="true">
            <BookOpen size={21} />
          </span>
          <div>
            <h1>Kindle Cards</h1>
            <p>本地阅读摘录工作台</p>
          </div>
        </div>

        <div className="headerActions">
          <button
            className="actionButton secondary"
            onClick={syncKindle}
            disabled={isSyncing || isExporting}
          >
            <RefreshCw
              className={isSyncing ? "spin" : ""}
              size={17}
              aria-hidden="true"
            />
            {isSyncing ? "正在同步" : "立即同步"}
          </button>
          <button
            className="actionButton primary"
            onClick={() => fileRef.current?.click()}
            disabled={isExporting}
          >
            <FileUp size={17} aria-hidden="true" />
            导入文件
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.currentTarget.value = "";
            }}
          />
          <details ref={pasteDetailsRef} className="importMore">
            <summary>粘贴导入</summary>
            <div className="importPopover">
              <label htmlFor="paste-clippings">My Clippings.txt 内容</label>
              <textarea
                id="paste-clippings"
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="粘贴 Kindle 摘录文本"
              />
              <button
                className="actionButton primary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  importParsed(
                    parseKindleClippings(pasteText) as Memo[],
                    new Date().toISOString(),
                    "粘贴内容",
                  );
                  setPasteText("");
                  if (pasteDetailsRef.current)
                    pasteDetailsRef.current.open = false;
                }}
              >
                <Upload size={16} aria-hidden="true" />
                解析内容
              </button>
            </div>
          </details>
        </div>
      </header>

      <section
        className={`statusStrip ${status.tone}`}
        role={statusRole}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="statusMessage">
          <StatusIcon
            className={status.tone === "working" ? "spin" : ""}
            size={16}
            aria-hidden="true"
          />
          <span>{status.text}</span>
        </div>
        <div className="libraryStats" aria-label="摘录统计">
          <span>
            <strong>{memos.length}</strong> 条摘录
          </span>
          <span>
            <strong>{books}</strong> 本书
          </span>
          <span>
            <strong>{tags.length}</strong> 个标签
          </span>
        </div>
      </section>

      <div className="workspace">
        <section className="libraryPane" aria-label="摘录库">
          <div className="paneHeading">
            <div>
              <p>阅读摘录</p>
              <h2>
                {filtered.length === memos.length
                  ? `${memos.length} 条内容`
                  : `${filtered.length} 条结果`}
              </h2>
            </div>
            <button
              className="quietButton"
              onClick={exportBatch}
              disabled={filtered.length === 0 || isExporting}
            >
              <Download size={16} aria-hidden="true" />
              {isExporting ? "正在导出" : "批量导出"}
            </button>
          </div>

          <div className="searchField">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="搜索摘录"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索摘录、评论、书名或标签"
            />
          </div>

          <div className="filterRow" role="group" aria-label="摘录筛选">
            {(
              [
                ["all", "全部"],
                ["recent", "最近导入"],
                ["untagged", "未整理"],
              ] as [FilterMode, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filterMode === value}
                className={filterMode === value ? "active" : ""}
                onClick={() => setFilterMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {tags.length > 0 && (
            <div className="tagScroller" role="group" aria-label="按标签筛选">
              <button
                className={!activeTag ? "active" : ""}
                aria-pressed={!activeTag}
                onClick={() => setActiveTag("")}
              >
                <Tags size={14} aria-hidden="true" /> 全部标签
              </button>
              {tags.map(([tag, count]) => (
                <button
                  key={tag}
                  className={activeTag === tag ? "active" : ""}
                  aria-pressed={activeTag === tag}
                  onClick={() => setActiveTag(tag)}
                >
                  #{tag} <span>{count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="memoList">
            {filtered.map((memo) => (
              <article
                key={memo.id}
                className={
                  selectedMemo?.id === memo.id
                    ? "memoItem selected"
                    : "memoItem"
                }
              >
                <button
                  className="memoSelect"
                  onClick={() => setSelectedId(memo.id)}
                >
                  <span className="memoMeta">
                    <strong>{memo.title}</strong>
                    <small>{formatLocation(memo)}</small>
                  </span>
                  <span className="memoQuote">
                    {memo.quote || memo.comment}
                  </span>
                  {memo.comment && memo.quote && (
                    <span className="memoComment">{memo.comment}</span>
                  )}
                  <span className="memoTags">
                    {memo.tags.length ? (
                      memo.tags.map((tag) => <span key={tag}>#{tag}</span>)
                    ) : (
                      <span>未整理</span>
                    )}
                  </span>
                </button>
                <button
                  className="buildButton"
                  onClick={() => {
                    setSelectedId(memo.id);
                    setMobileView("studio");
                  }}
                >
                  制作卡片
                </button>
              </article>
            ))}
            {filtered.length === 0 && (
              <div className="emptyState">
                <span aria-hidden="true">
                  <Library size={24} />
                </span>
                <h3>
                  {memos.length ? "没有匹配的摘录" : "从 Kindle 带回第一条摘录"}
                </h3>
                <p>
                  {memos.length
                    ? "试试清除搜索词或切换筛选。"
                    : "连接 Kindle 同步，或导入 My Clippings.txt。"}
                </p>
                {!memos.length && (
                  <button
                    className="actionButton primary"
                    onClick={() => fileRef.current?.click()}
                  >
                    <FileUp size={16} aria-hidden="true" /> 导入文件
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="studioPane" aria-label="卡片工作台">
          <div className="studioHeading">
            <div>
              <p>卡片工作台</p>
              <h2>
                {selectedMemo ? compactTitle(selectedMemo.title) : "等待摘录"}
              </h2>
            </div>
            <span>
              {sizePresets[size].width} ×{" "}
              {
                getCardDimensions(
                  size,
                  template,
                  selectedMemo?.quote || "",
                  selectedMemo?.comment || "",
                ).height
              }
            </span>
          </div>

          <div className="controlDeck">
            <fieldset>
              <legend>内容</legend>
              <div className="segmented">
                {(["quote", "comment", "memo"] as Template[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={template === item}
                    className={template === item ? "active" : ""}
                    onClick={() => changeSetting("template", item)}
                  >
                    {item === "quote"
                      ? "金句"
                      : item === "comment"
                        ? "评论"
                        : "Memo"}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>主题</legend>
              <div className="segmented iconSegmented">
                {(["paper", "light", "dark"] as Theme[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-label={
                      item === "paper"
                        ? "纸张主题"
                        : item === "light"
                          ? "浅色主题"
                          : "深色主题"
                    }
                    aria-pressed={theme === item}
                    className={theme === item ? "active" : ""}
                    onClick={() => changeSetting("theme", item)}
                  >
                    {item === "dark" ? (
                      <Moon size={15} aria-hidden="true" />
                    ) : item === "light" ? (
                      <Sun size={15} aria-hidden="true" />
                    ) : (
                      <Sparkles size={15} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="sizeField">
              <span>尺寸</span>
              <select
                value={size}
                onChange={(event) =>
                  changeSetting("size", event.target.value as SizePreset)
                }
              >
                {Object.entries(sizePresets).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedMemo ? (
            <>
              <CardPreview
                ref={cardRef}
                memo={selectedMemo}
                template={template}
                theme={theme}
                size={size}
                memoCount={memos.length}
                bookCount={books}
                memos={memos}
              />
              <section className="editorPanel">
                <div className="editorHeading">
                  <h3>整理内容</h3>
                  <span>自动保存在本机</span>
                </div>
                <label>
                  <span>摘录</span>
                  <textarea
                    value={selectedMemo.quote}
                    onChange={(event) =>
                      updateMemo(selectedMemo.id, { quote: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>评论</span>
                  <textarea
                    value={selectedMemo.comment}
                    placeholder="写下这句话为什么值得保留"
                    onChange={(event) =>
                      updateMemo(selectedMemo.id, {
                        comment: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span>标签</span>
                  <input
                    value={selectedMemo.tags.map((tag) => `#${tag}`).join(" ")}
                    placeholder="#写作 #心理学"
                    onChange={(event) => {
                      const nextTags = Array.from(
                        event.target.value.matchAll(
                          /#([\p{L}\p{N}_\-\u4e00-\u9fa5]+)/gu,
                        ),
                      ).map((match) => match[1]);
                      updateMemo(selectedMemo.id, {
                        tags: normalizeTags(nextTags),
                      });
                    }}
                  />
                </label>
                <div className="studioActions">
                  <button
                    className="actionButton secondary"
                    onClick={copyMemoText}
                    disabled={isExporting}
                  >
                    {didCopy ? (
                      <Check size={17} aria-hidden="true" />
                    ) : (
                      <Copy size={17} aria-hidden="true" />
                    )}
                    {didCopy ? "已复制" : "复制笔记文本"}
                  </button>
                  <button
                    className="actionButton primary"
                    onClick={exportCard}
                    disabled={isExporting}
                  >
                    <ImageDown size={17} aria-hidden="true" />
                    {isExporting ? "正在导出" : "导出 PNG"}
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="emptyState previewEmpty">
              <span aria-hidden="true">
                <Hash size={24} />
              </span>
              <h3>还没有可预览的内容</h3>
              <p>导入摘录后，可以在这里编辑并导出分享卡片。</p>
            </div>
          )}
        </aside>
      </div>

      <nav className="mobileSwitcher" aria-label="移动端工作区切换">
        <button
          className={mobileView === "library" ? "active" : ""}
          onClick={() => setMobileView("library")}
        >
          <Library size={17} aria-hidden="true" /> 摘录
        </button>
        <button
          className={mobileView === "studio" ? "active" : ""}
          onClick={() => setMobileView("studio")}
          disabled={!selectedMemo}
        >
          <Sparkles size={17} aria-hidden="true" /> 卡片
        </button>
      </nav>
    </main>
  );
}
