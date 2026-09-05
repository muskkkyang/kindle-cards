import { useEffect, useRef, useState } from "react";
import { ImagePlus, Download, ScanText, RefreshCw } from "lucide-react";
import {
  downloadScreenshotBlob,
  loadScreenshotImage,
  renderScreenshotCard,
} from "../lib/screenshotCard";
import type { Screenshot, ScreenshotEdit } from "../lib/screenshotCard";

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(35_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok)
    throw new Error(payload.message || "截图操作失败，请重试。");
  if (
    (url === "/api/screenshots" || url === "/api/screenshots/scan") &&
    !Array.isArray(payload.items)
  )
    throw new Error("截图列表响应格式无效，已保留当前内容。");
  return payload;
}

export function ScreenshotWorkspace({
  books,
  active,
  onCount,
}: {
  books: string[];
  active: boolean;
  onCount: (count: number) => void;
}) {
  const [items, setItems] = useState<Screenshot[]>([]);
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState(
    "连接 Kindle 后自动发现截图，也可以导入本地图片。",
  );
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingPending, setEditingPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const pending = items.filter((item) => !item.imported);
  const library = items.filter((item) => item.imported);
  const current = library.find((item) => item.id === selected) || library[0];

  useEffect(() => {
    onCount(items.length);
  }, [items.length, onCount]);
  useEffect(() => {
    let disposed = false;
    async function scan() {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      try {
        const result = await request("/api/screenshots/scan", {
          method: "POST",
        });
        if (!disposed) {
          // A scan must not roll back metadata saved while that scan was running.
          const latest = await request("/api/screenshots");
          if (disposed) return;
          setItems(latest.items);
          setFailed(false);
          setNotice(
            result.warnings?.length
              ? result.warnings.join(" ")
              : result.connected
                ? "Kindle 已连接，正在自动监测新截图。"
                : "等待 Kindle 连接；已导入的截图随时可用。",
          );
        }
      } catch (error) {
        if (!disposed) {
          setFailed(true);
          setNotice(
            error instanceof Error
              ? error.message
              : "截图检测失败，将自动重试。",
          );
        }
      } finally {
        inFlight.current = false;
      }
    }
    void request("/api/screenshots")
      .then((result) => {
        if (!disposed) setItems(result.items);
      })
      .catch(() => {});
    const initial = window.setTimeout(() => void scan(), 250);
    const timer = window.setInterval(() => void scan(), 5000);
    const visible = () => void scan();
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch (error) {
      setFailed(true);
      setNotice(
        error instanceof Error ? error.message : "操作失败，原图已保留。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    await act(async () => {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error(`${file.name} 超过 20 MB。`);
        const result = await request(
          `/api/screenshots/upload?name=${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          },
        );
        setItems((current) => [
          result.item,
          ...current.filter((item) => item.id !== result.item.id),
        ]);
        setSelected(result.item.id);
      }
      setNotice("截图已保存；重复图片会合并，原图始终保留。");
    });
  }
  return (
    <section
      className="screenshotWorkspace"
      hidden={!active}
      aria-label="截图工作区"
    >
      <div className="screenshotHeading">
        <div>
          <p className="eyebrow">阅读的另一种留存</p>
          <h2>截图</h2>
        </div>
        <button
          className="actionButton primary"
          disabled={busy || editingPending}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus size={17} />
          导入截图
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg"
          aria-label="选择截图文件"
          onChange={(event) => {
            void upload(Array.from(event.target.files || []));
            event.currentTarget.value = "";
          }}
        />
      </div>
      <p
        className={`screenshotNotice ${failed ? "error" : ""}`}
        role={failed ? "alert" : "status"}
      >
        {notice}
      </p>
      {pending.length > 0 && (
        <div className="screenshotDiscovery">
          <span>发现 {pending.length} 张新截图</span>
          <button
            className="actionButton secondary"
            disabled={busy || editingPending}
            onClick={() =>
              void act(async () => {
                const imported: Screenshot[] = [];
                for (const item of pending) {
                  const result = await request(`/api/screenshots/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imported: true }),
                  });
                  imported.push(result.item);
                }
                setItems((items) =>
                  items.map(
                    (item) =>
                      imported.find((next) => next.id === item.id) || item,
                  ),
                );
                setSelected(imported[0]?.id || "");
                setNotice(`已导入 ${imported.length} 张截图。`);
              })
            }
          >
            导入新截图
          </button>
        </div>
      )}
      {library.length === 0 ? (
        <div className="screenshotEmpty">
          <ImagePlus size={32} />
          <h3>把阅读中的一页留下来</h3>
          <p>导入截图，裁掉边缘，再为它写一句自己的话。</p>
          <p>支持 PNG、JPEG · 原图保存在本机</p>
        </div>
      ) : (
        <div className="screenshotLayout">
          <aside className="screenshotLibrary" aria-label="截图库">
            {library.map((item) => (
              <button
                key={item.id}
                className={`screenshotThumb ${current?.id === item.id ? "selected" : ""}`}
                onClick={() => setSelected(item.id)}
                disabled={editingPending || busy}
                aria-label={`编辑截图 ${item.name}`}
                aria-pressed={current?.id === item.id}
              >
                <img src={item.url} alt={item.name} />
                <span>{item.edit.book || item.name}</span>
              </button>
            ))}
          </aside>
          {current && (
            <ScreenshotEditor
              key={current.id}
              item={current}
              books={books}
              onPending={setEditingPending}
              onSaved={(item) =>
                setItems((items) =>
                  items.map((old) => (old.id === item.id ? item : old)),
                )
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

function ScreenshotEditor({
  item,
  books,
  onSaved,
  onPending,
}: {
  item: Screenshot;
  books: string[];
  onSaved: (item: Screenshot) => void;
  onPending: (pending: boolean) => void;
}) {
  const [edit, setEdit] = useState<ScreenshotEdit>(() =>
    structuredClone(item.edit),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const editRef = useRef(edit);
  const saveQueue = useRef(Promise.resolve());
  const dirtyRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    onPending(dirty || busy);
  }, [dirty, busy, onPending]);

  function change(next: ScreenshotEdit) {
    if (
      next.book.length > 200 ||
      next.caption.length > 1000 ||
      next.text.length > 20000
    ) {
      setMessage(
        "书名最多 200 字，批注最多 1000 字；较长的识别文字请导出后整理。",
      );
      return;
    }
    editRef.current = next;
    dirtyRef.current = true;
    setEdit(next);
    setDirty(true);
    setMessage("");
  }
  function save(next: ScreenshotEdit) {
    const task = saveQueue.current.then(async () => {
      const result = await request(`/api/screenshots/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edit: next }),
      });
      onSaved(result.item);
      if (editRef.current === next) {
        dirtyRef.current = false;
        setDirty(false);
        setMessage("已保存");
      }
    });
    saveQueue.current = task.catch((error) =>
      setMessage(`保存失败：${error.message}。请点击保存重试。`),
    );
    return task;
  }
  useEffect(() => {
    flushRef.current = () => {
      if (dirtyRef.current) void save(editRef.current).catch(() => {});
    };
  });
  useEffect(() => () => flushRef.current(), []);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void save(edit).catch(() => {}), 600);
    return () => {
      clearTimeout(timer);
    };
    // Saving follows the edit value only; scan refreshes must not restart it.
  }, [edit, dirty]);
  useEffect(() => {
    let disposed = false;
    void loadScreenshotImage(item.url)
      .then((image) => {
        if (!disposed) {
          imageRef.current = image;
          setReady(true);
        }
      })
      .catch((error) => setMessage(error.message));
    return () => {
      disposed = true;
    };
  }, [item.url]);
  useEffect(() => {
    if (ready && imageRef.current && canvasRef.current)
      renderScreenshotCard(canvasRef.current, imageRef.current, edit);
  }, [edit, ready]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function action(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  function cropEdge(edge: "top" | "bottom" | "left" | "right", value: number) {
    const c = edit.crop;
    const top = c.y,
      bottom = 100 - c.y - c.height,
      left = c.x,
      right = 100 - c.x - c.width;
    const next = { top, bottom, left, right, [edge]: value };
    change({
      ...edit,
      crop: {
        x: next.left,
        y: next.top,
        width: 100 - next.left - next.right,
        height: 100 - next.top - next.bottom,
      },
    });
  }
  return (
    <div className="screenshotEditor">
      <div className="screenshotPreview">
        <canvas ref={canvasRef} aria-label="截图卡片预览" />
        <p>{ready ? "预览与导出使用同一画布" : "正在加载原图…"}</p>
      </div>
      <div className="screenshotControls">
        <h3>让这一页成为卡片</h3>
        <fieldset disabled={busy}>
          <legend>裁切边缘</legend>
          {(["top", "bottom", "left", "right"] as const).map((edge, index) => {
            const c = edit.crop;
            const value =
              edge === "top"
                ? c.y
                : edge === "bottom"
                  ? 100 - c.y - c.height
                  : edge === "left"
                    ? c.x
                    : 100 - c.x - c.width;
            return (
              <label className="cropControl" key={edge}>
                {["上", "下", "左", "右"][index]}
                <input
                  aria-label={`${["上", "下", "左", "右"][index]}边裁切`}
                  type="range"
                  min="0"
                  max="45"
                  step="1"
                  value={value}
                  onChange={(event) =>
                    cropEdge(edge, Number(event.target.value))
                  }
                />
                <output>{Math.round(value)}%</output>
              </label>
            );
          })}
          <button
            className="quietButton"
            onClick={() =>
              change({ ...edit, crop: { x: 0, y: 0, width: 100, height: 100 } })
            }
          >
            <RefreshCw size={14} />
            恢复完整画面
          </button>
        </fieldset>
        <label>
          所属书籍
          <input
            list="screenshot-books"
            maxLength={200}
            value={edit.book}
            disabled={busy}
            onChange={(event) => change({ ...edit, book: event.target.value })}
            placeholder="选择或填写书名"
          />
        </label>
        <datalist id="screenshot-books">
          {books.map((book) => (
            <option key={book} value={book} />
          ))}
        </datalist>
        <label>
          卡片批注
          <textarea
            rows={3}
            maxLength={1000}
            value={edit.caption}
            disabled={busy}
            onChange={(event) =>
              change({ ...edit, caption: event.target.value })
            }
            placeholder="为这一页留一句话"
          />
        </label>
        <div className="screenshotOptions">
          <label>
            纸张
            <select
              value={edit.theme}
              disabled={busy}
              onChange={(event) =>
                change({
                  ...edit,
                  theme: event.target.value as ScreenshotEdit["theme"],
                })
              }
            >
              <option value="paper">暖纸</option>
              <option value="light">纯白</option>
              <option value="dark">深色</option>
              <option value="receipt">小票</option>
            </select>
          </label>
          <label>
            比例
            <select
              value={edit.size}
              disabled={busy}
              onChange={(event) =>
                change({
                  ...edit,
                  size: event.target.value as ScreenshotEdit["size"],
                })
              }
            >
              <option value="portrait">3:4</option>
              <option value="square">1:1</option>
              <option value="landscape">3:2</option>
              <option value="phone">手机全屏 9:16</option>
            </select>
          </label>
        </div>
        <details className="screenshotOcr">
          <summary>识别与整理文字</summary>
          <button
            className="quietButton"
            disabled={busy || !ready}
            onClick={() =>
              void action(async () => {
                const result = await request(
                  `/api/screenshots/${item.id}/ocr`,
                  { method: "POST" },
                );
                change({
                  ...edit,
                  text: [edit.text, result.text].filter(Boolean).join("\n\n"),
                });
                setMessage(
                  result.text
                    ? "原图文字已识别，请校对后使用。"
                    : "未识别到文字，可以手动填写。",
                );
              })
            }
          >
            <ScanText size={16} />
            识别原图文字
          </button>
          <textarea
            aria-label="识别文字"
            maxLength={20000}
            rows={6}
            value={edit.text}
            disabled={busy}
            onChange={(event) => change({ ...edit, text: event.target.value })}
          />
          <button
            className="quietButton"
            disabled={busy || !edit.text}
            onClick={() =>
              change({
                ...edit,
                caption: [edit.caption, edit.text].filter(Boolean).join("\n\n"),
              })
            }
          >
            加入卡片批注
          </button>
          <button
            className="quietButton"
            disabled={!edit.text}
            onClick={() =>
              downloadScreenshotBlob(
                new Blob([edit.text], { type: "text/plain;charset=utf-8" }),
                "截图文字.txt",
              )
            }
          >
            导出文字
          </button>
        </details>
        <div className="screenshotActions">
          <button
            className="actionButton secondary"
            disabled={busy}
            onClick={() => void action(() => save(edit))}
          >
            保存编辑
          </button>
          <button
            className="actionButton primary"
            disabled={busy || !ready}
            onClick={() =>
              void action(async () => {
                await save(edit);
                const canvas = canvasRef.current;
                if (!canvas) return;
                const blob = await new Promise<Blob>((resolve, reject) =>
                  canvas.toBlob(
                    (blob) =>
                      blob
                        ? resolve(blob)
                        : reject(new Error("图片输出失败。")),
                    "image/png",
                  ),
                );
                downloadScreenshotBlob(
                  blob,
                  `${(edit.book || "Kindle截图").replace(/[<>:"/\\|?*]/g, "-")}.png`,
                );
                setMessage("卡片已导出，原图保持不变。");
              })
            }
          >
            <Download size={16} />
            {busy ? "处理中" : "导出 PNG"}
          </button>
        </div>
        <a className="screenshotOriginal" href={item.url} download={item.name}>
          下载原图
        </a>
        <p className="screenshotSaveState" role="status">
          {message || (dirty ? "正在保存…" : "编辑只影响卡片，原图始终保留。")}
        </p>
      </div>
    </div>
  );
}
