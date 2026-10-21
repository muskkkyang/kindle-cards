import type { AppSettings, Memo } from "../types";

export const cardFonts = {
  sans: '"Microsoft YaHei", "PingFang SC", sans-serif',
  serif: '"Noto Serif SC", "SimSun", serif',
  mono: '"Cascadia Code", "Consolas", "Microsoft YaHei", monospace',
};

export function bookKey(memo: Pick<Memo, "title" | "author">) {
  return JSON.stringify([memo.title.trim(), memo.author.trim()]);
}

export function groupBooks(memos: Memo[]) {
  const groups = new Map<
    string,
    { key: string; title: string; author: string; count: number }
  >();
  for (const memo of memos) {
    const key = bookKey(memo);
    const previous = groups.get(key);
    if (previous) previous.count += 1;
    else
      groups.set(key, {
        key,
        title: memo.title,
        author: memo.author,
        count: 1,
      });
  }
  return [...groups.values()];
}

export async function uploadMedia(file: File) {
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("请选择小于 5 MB 的 PNG 或 JPEG 图片。");
  const bitmap = await createImageBitmap(file);
  const pixels = bitmap.width * bitmap.height;
  bitmap.close();
  if (pixels > 40_000_000)
    throw new Error("图片超过 4000 万像素，请缩小后导入。");
  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result.message || "图片导入失败。");
  return result.url as string;
}

export function mergeRestoredSettings(
  current: AppSettings,
  incoming: AppSettings,
): AppSettings {
  return {
    ...incoming,
    bookCovers: { ...incoming.bookCovers, ...current.bookCovers },
  };
}
