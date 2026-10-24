import type {
  AppSettings,
  Memo,
  MemoType,
  SizePreset,
  Template,
  Theme,
} from "../types";

export const STORAGE_KEY = "kindle-cards:memos";
export const SETTINGS_KEY = "kindle-cards:settings";
export const MAX_STORED_MEMOS = 20_000;

const DEFAULT_SETTINGS: AppSettings = {
  template: "quote",
  theme: "dark",
  size: "landscape",
};
const memoryStore = new Map<string, string>();

type SaveResult =
  | { ok: true; revision: string }
  | { ok: false; message: string; conflict?: boolean };
type WriteResult = { ok: true } | { ok: false; message: string };

type StoredMemoEnvelope = {
  format: "kindle-cards-memos";
  version: 1;
  revision: string;
  memos: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function memoType(value: unknown): MemoType | undefined {
  return value === "highlight" || value === "note" || value === "bookmark"
    ? value
    : undefined;
}

export function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

export function normalizeMemo(value: unknown): Memo | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).trim();
  if (!id) return null;

  return {
    id,
    title: stringValue(value.title, "未知书籍").trim() || "未知书籍",
    author: stringValue(value.author).trim(),
    type: memoType(value.type),
    quote: stringValue(value.quote),
    rawNote: typeof value.rawNote === "string" ? value.rawNote : undefined,
    comment: stringValue(value.comment),
    tags: normalizeTags(value.tags),
    locationStart: numberOrNull(value.locationStart),
    locationEnd: numberOrNull(value.locationEnd),
    page: stringValue(value.page),
    addedAtRaw: stringValue(value.addedAtRaw),
    importedAt:
      typeof value.importedAt === "string" ? value.importedAt : undefined,
    favorite: Boolean(value.favorite),
    editedFields: normalizeTags(value.editedFields),
  };
}

export function parseStoredMemos(raw: string) {
  if (!raw) return { memos: [] as Memo[], warning: "", revision: "empty" };

  try {
    const parsed: unknown = JSON.parse(raw);
    const envelope =
      isRecord(parsed) &&
      parsed.format === "kindle-cards-memos" &&
      parsed.version === 1 &&
      typeof parsed.revision === "string" &&
      Array.isArray(parsed.memos)
        ? (parsed as StoredMemoEnvelope)
        : null;
    const records = Array.isArray(parsed) ? parsed : envelope?.memos;
    if (!records) {
      return {
        memos: [] as Memo[],
        warning: "本地摘录数据格式异常，已安全跳过。",
        revision: "invalid",
      };
    }

    const limited = records.slice(0, MAX_STORED_MEMOS);
    const memos = limited
      .map(normalizeMemo)
      .filter((memo): memo is Memo => Boolean(memo));
    const skipped = records.length - memos.length;
    const warning =
      skipped > 0 ? `本地数据中有 ${skipped} 条无效记录，已安全跳过。` : "";
    return {
      memos,
      warning,
      revision: envelope?.revision || `legacy:${simpleHash(raw)}`,
    };
  } catch {
    return {
      memos: [] as Memo[],
      warning: "本地摘录数据无法读取，原始内容未被覆盖。",
      revision: "invalid",
    };
  }
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function nextRevision() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStorage(key: string) {
  try {
    const value = window.localStorage?.getItem(key);
    if (value != null) {
      memoryStore.set(key, value);
      return value;
    }
    memoryStore.delete(key);
    return "";
  } catch {
    return memoryStore.get(key) || "";
  }
}

function writeStorage(key: string, value: string): WriteResult {
  memoryStore.set(key, value);
  try {
    window.localStorage?.setItem(key, value);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "浏览器无法写入本地存储，本次修改仅在当前窗口保留。请尽快导出卡片。",
    };
  }
}

export function loadMemos() {
  return parseStoredMemos(readStorage(STORAGE_KEY));
}

export function saveMemos(
  memos: Memo[],
  expectedRevision?: string,
): SaveResult {
  const current = parseStoredMemos(readStorage(STORAGE_KEY));
  if (current.warning) {
    return {
      ok: false,
      message:
        "原始本地数据存在异常，已停止写入以保留原始内容。请先备份并修复数据。",
    };
  }
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    return {
      ok: false,
      conflict: true,
      message:
        "另一窗口已更新摘录，本窗口的修改没有覆盖它。请先备份当前内容，再刷新页面继续。",
    };
  }
  if (memos.length > MAX_STORED_MEMOS) {
    return {
      ok: false,
      message: `本地最多保存 ${MAX_STORED_MEMOS} 条摘录，请缩小导入范围。`,
    };
  }
  const revision = nextRevision();
  const result = writeStorage(
    STORAGE_KEY,
    JSON.stringify({
      format: "kindle-cards-memos",
      version: 1,
      revision,
      memos,
    }),
  );
  return result.ok ? { ok: true, revision } : result;
}

function isTemplate(value: unknown): value is Template {
  return (
    value === "quote" ||
    value === "comment" ||
    value === "memo" ||
    value === "editorial"
  );
}

function isTheme(value: unknown): value is Theme {
  return (
    value === "paper" ||
    value === "light" ||
    value === "dark" ||
    value === "receipt"
  );
}

function isSize(value: unknown): value is SizePreset {
  return (
    value === "landscape" ||
    value === "square" ||
    value === "portrait" ||
    value === "wide" ||
    value === "phone"
  );
}

export function loadSettings(): AppSettings {
  try {
    const parsed: unknown = JSON.parse(readStorage(SETTINGS_KEY) || "{}");
    const settings = normalizeSettings(parsed);
    writeStorage(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function normalizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;
  return {
    template: isTemplate(value.template)
      ? value.template
      : DEFAULT_SETTINGS.template,
    theme: isTheme(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
    size: isSize(value.size) ? value.size : DEFAULT_SETTINGS.size,
    font: value.font === "serif" || value.font === "mono" ? value.font : "sans",
    fontScale:
      typeof value.fontScale === "number" && Number.isFinite(value.fontScale)
        ? Math.min(1.4, Math.max(0.8, value.fontScale))
        : 1,
    spacing:
      value.spacing === "compact" || value.spacing === "airy"
        ? value.spacing
        : "balanced",
    align: value.align === "center" ? "center" : "left",
    background: mediaUrl(value.background),
    bookCovers: isRecord(value.bookCovers)
      ? Object.fromEntries(
          Object.entries(value.bookCovers)
            .filter(
              ([key, url]) => key.length <= 1000 && Boolean(mediaUrl(url)),
            )
            .map(([key, url]) => [key, mediaUrl(url)]),
        )
      : {},
  };
}

export function saveSettings(settings: AppSettings) {
  return writeStorage(SETTINGS_KEY, JSON.stringify(settings));
}

function mediaUrl(value: unknown) {
  return typeof value === "string" &&
    /^\/api\/media\/[a-f0-9]{64}\.(png|jpg)$/.test(value)
    ? value
    : "";
}
