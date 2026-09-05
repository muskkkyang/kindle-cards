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

type SaveResult = { ok: true } | { ok: false; message: string };

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
  if (!raw) return { memos: [] as Memo[], warning: "" };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        memos: [] as Memo[],
        warning: "本地摘录数据格式异常，已安全跳过。",
      };
    }

    const limited = parsed.slice(0, MAX_STORED_MEMOS);
    const memos = limited
      .map(normalizeMemo)
      .filter((memo): memo is Memo => Boolean(memo));
    const skipped = parsed.length - memos.length;
    const warning =
      skipped > 0 ? `本地数据中有 ${skipped} 条无效记录，已安全跳过。` : "";
    return { memos, warning };
  } catch {
    return {
      memos: [] as Memo[],
      warning: "本地摘录数据无法读取，原始内容未被覆盖。",
    };
  }
}

function readStorage(key: string) {
  try {
    const value = window.localStorage?.getItem(key);
    if (value != null) {
      memoryStore.set(key, value);
      return value;
    }

    return memoryStore.get(key) || "";
  } catch {
    return memoryStore.get(key) || "";
  }
}

function writeStorage(key: string, value: string): SaveResult {
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

export function saveMemos(memos: Memo[]): SaveResult {
  if (parseStoredMemos(readStorage(STORAGE_KEY)).warning) {
    return {
      ok: false,
      message:
        "原始本地数据存在异常，已停止写入以保留原始内容。请先备份并修复数据。",
    };
  }
  if (memos.length > MAX_STORED_MEMOS) {
    return {
      ok: false,
      message: `本地最多保存 ${MAX_STORED_MEMOS} 条摘录，请缩小导入范围。`,
    };
  }
  return writeStorage(STORAGE_KEY, JSON.stringify(memos));
}

function isTemplate(value: unknown): value is Template {
  return value === "quote" || value === "comment" || value === "memo";
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
    if (!isRecord(parsed)) return DEFAULT_SETTINGS;
    const settings: AppSettings = {
      template: isTemplate(parsed.template)
        ? parsed.template
        : DEFAULT_SETTINGS.template,
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      size: isSize(parsed.size) ? parsed.size : DEFAULT_SETTINGS.size,
    };
    writeStorage(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  return writeStorage(SETTINGS_KEY, JSON.stringify(settings));
}
