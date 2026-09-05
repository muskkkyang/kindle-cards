import type { Memo, SizePreset, Template } from "../types";

export const sizePresets: Record<
  SizePreset,
  { label: string; width: number; height: number }
> = {
  landscape: { label: "阅读横卡", width: 720, height: 498 },
  square: { label: "朋友圈 1:1", width: 1080, height: 1080 },
  portrait: { label: "小红书 3:4", width: 1080, height: 1440 },
  wide: { label: "公众号横图", width: 1200, height: 675 },
  phone: { label: "手机全屏 9:16", width: 1080, height: 1920 },
};

function countContentLines(text: string, charsPerLine: number) {
  const normalized = text.trim();
  if (!normalized) return 0;

  return normalized
    .split(/\n+/)
    .reduce(
      (total, line) =>
        total +
        Math.max(1, Math.ceil(line.replace(/\s/g, "").length / charsPerLine)),
      0,
    );
}

export function getCardDimensions(
  size: SizePreset,
  template: Template,
  quote: string,
  comment: string,
) {
  const preset = sizePresets[size];
  if (size === "phone") return { width: preset.width, height: preset.height };

  if (size !== "landscape") {
    const quoteLines = countContentLines(quote, size === "wide" ? 42 : 26);
    const commentLines =
      template === "comment"
        ? countContentLines(comment, size === "wide" ? 48 : 30)
        : 0;
    const extraHeight =
      Math.max(0, quoteLines - 5) * 58 + Math.max(0, commentLines - 2) * 42;
    return { width: preset.width, height: preset.height + extraHeight };
  }

  const quoteLines = countContentLines(quote, 30);
  const commentLines =
    template === "comment" ? countContentLines(comment, 38) : 0;
  const extraHeight =
    Math.max(0, quoteLines - 3) * 33 + Math.max(0, commentLines - 1) * 28;

  return { width: preset.width, height: Math.max(498, 498 + extraHeight) };
}

export function formatLocation(memo: Memo) {
  if (memo.page) return `第 ${memo.page} 页`;
  if (memo.locationStart != null && memo.locationEnd != null) {
    return `位置 ${memo.locationStart}-${memo.locationEnd}`;
  }
  if (memo.locationStart != null) return `位置 ${memo.locationStart}`;
  return "";
}

export function formatCardDate(value?: string) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

export function getQuoteScale(text: string) {
  const length = text.replace(/\s/g, "").length;
  if (length <= 18) return "shortText";
  if (length <= 48) return "mediumText";
  if (length <= 92) return "longText";
  return "essayText";
}

export function compactTitle(title: string) {
  return (
    title
      .replace(/（.*?）|\(.*?\)/g, "")
      .replace(/[\u2014-]+.*$/g, "")
      .trim() || title
  );
}

export function getRecentCutoff(memos: Memo[]) {
  return memos.reduce(
    (max, memo) => Math.max(max, Date.parse(memo.importedAt || "") || 0),
    0,
  );
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseMemoDate(memo: Memo) {
  const raw = memo.addedAtRaw || "";
  const chineseDate = raw.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (chineseDate) {
    return new Date(
      Number(chineseDate[1]),
      Number(chineseDate[2]) - 1,
      Number(chineseDate[3]),
    );
  }

  const parsedRaw = Date.parse(raw);
  if (!Number.isNaN(parsedRaw)) return new Date(parsedRaw);

  const parsedImported = Date.parse(memo.importedAt || "");
  if (!Number.isNaN(parsedImported)) return new Date(parsedImported);

  return null;
}

export type ReadingHeatmapData = ReturnType<typeof buildReadingHeatmap>;

export function buildReadingHeatmap(memos: Memo[], weekCount: number) {
  const counts = new Map<string, number>();
  const dates = memos
    .map(parseMemoDate)
    .filter((date): date is Date => Boolean(date));

  dates.forEach((date) => {
    const key = toDateKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const latest = dates.reduce(
    (max, date) => Math.max(max, date.getTime()),
    Date.now(),
  );
  const end = new Date(latest);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const start = new Date(end);
  start.setDate(end.getDate() - weekCount * 7 + 1);

  const cells: Array<{ key: string; count: number; level: number }> = [];
  const monthLabels = new Map<number, string>();
  const seenMonthLabels = new Set<string>();
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  for (let week = 0; week < weekCount; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);
      const key = toDateKey(date);
      const count = counts.get(key) || 0;
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

      if (
        date.getDate() <= 7 &&
        !monthLabels.has(week) &&
        !seenMonthLabels.has(monthKey)
      ) {
        monthLabels.set(week, monthNames[date.getMonth()]);
        seenMonthLabels.add(monthKey);
      }

      cells.push({
        key,
        count,
        level: count === 0 ? 0 : Math.min(4, Math.ceil(count / 2)),
      });
    }
  }

  return {
    cells,
    months: Array.from(
      { length: weekCount },
      (_, index) => monthLabels.get(index) || "",
    ),
    weekCount,
  };
}

export function safeFileStem(value: string) {
  const withoutControls = Array.from(compactTitle(value), (character) =>
    character.charCodeAt(0) < 32 ? " " : character,
  ).join("");
  const stem = withoutControls
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return stem || "kindle-card";
}
