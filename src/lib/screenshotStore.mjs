import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export function imageType(bytes) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  throw new Error("仅支持 PNG 或 JPEG 截图。");
}

export function validateEdit(value) {
  if (!value || typeof value !== "object")
    throw new Error("截图编辑格式无效。");
  const { crop, book, caption, text, theme, size } = value;
  if (
    !crop ||
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > 100.01 ||
    crop.y + crop.height > 100.01
  )
    throw new Error("裁切区域必须在图片范围内。");
  if (
    ![book, caption, text].every(
      (v) => typeof v === "string" && v.length <= 20000,
    )
  )
    throw new Error("文字格式无效或超过长度限制。");
  if (book.length > 200 || caption.length > 1000)
    throw new Error(
      "书名最多 200 字，卡片批注最多 1000 字；长文请保存在识别文字中。",
    );
  if (
    !["paper", "light", "dark", "receipt"].includes(theme) ||
    !["portrait", "square", "landscape", "phone"].includes(size)
  )
    throw new Error("卡片样式无效。");
  return {
    crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    book,
    caption,
    text,
    theme,
    size,
  };
}

// Images are immutable and content-addressed. Each edit is an additive revision,
// so an interrupted write never replaces the last complete metadata record.
export function createScreenshotStore(directory) {
  let queue = Promise.resolve();
  function serial(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }
  async function list() {
    await fs.mkdir(directory, { recursive: true });
    const result = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      const folder = path.join(directory, entry.name);
      const revisions = (await fs.readdir(folder))
        .filter((n) => /^\d{12}\.json$/.test(n))
        .sort()
        .reverse();
      for (const revision of revisions) {
        try {
          const item = JSON.parse(
            await fs.readFile(path.join(folder, revision), "utf8"),
          );
          if (
            item.id !== entry.name ||
            !["png", "jpg"].includes(item.extension)
          )
            continue;
          result.push(item);
          break;
        } catch {
          /* A partial new revision must not hide a prior complete one. */
        }
      }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function append(item) {
    const folder = path.join(directory, item.id);
    await fs.mkdir(folder, { recursive: true });
    const revisions = (await fs.readdir(folder))
      .filter((n) => /^\d{12}\.json$/.test(n))
      .sort();
    const revision = Number(revisions.at(-1)?.slice(0, 12) || 0) + 1;
    await fs.writeFile(
      path.join(folder, `${String(revision).padStart(12, "0")}.json`),
      JSON.stringify(item),
      { flag: "wx" },
    );
    return item;
  }
  return {
    directory,
    list,
    async get(id) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("无效的截图编号。");
      const item = (await list()).find((item) => item.id === id);
      if (!item) throw new Error("截图不存在。");
      return item;
    },
    originalPath(item) {
      return path.join(directory, item.id, `original.${item.extension}`);
    },
    add(bytes, name, sourceKey = "", imported = false) {
      return serial(async () => {
        if (
          !Buffer.isBuffer(bytes) ||
          !bytes.length ||
          bytes.length > MAX_IMAGE_BYTES
        )
          throw new Error("截图须小于 20 MB。");
        const extension = imageType(bytes);
        const id = createHash("sha256").update(bytes).digest("hex");
        const current = (await list()).find((item) => item.id === id);
        if (current) {
          if (
            (sourceKey && !current.sourceKeys.includes(sourceKey)) ||
            (imported && !current.imported)
          )
            return append({
              ...current,
              imported: current.imported || imported,
              sourceKeys: [
                ...new Set([...current.sourceKeys, sourceKey].filter(Boolean)),
              ],
            });
          return current;
        }
        const folder = path.join(directory, id);
        await fs.mkdir(folder, { recursive: true });
        try {
          await fs.writeFile(
            path.join(folder, `original.${extension}`),
            bytes,
            { flag: "wx" },
          );
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
        }
        return append({
          id,
          extension,
          name: String(name).slice(0, 200),
          sourceKeys: sourceKey ? [sourceKey] : [],
          imported,
          createdAt: new Date().toISOString(),
          edit: {
            crop: { x: 0, y: 0, width: 100, height: 100 },
            book: "",
            caption: "",
            text: "",
            theme: "paper",
            size: "portrait",
          },
        });
      });
    },
    update(id, changes) {
      return serial(async () => {
        const item = await this.get(id);
        const edit = changes.edit ? validateEdit(changes.edit) : item.edit;
        return append({
          ...item,
          edit,
          imported: changes.imported === true || item.imported,
        });
      });
    },
  };
}
