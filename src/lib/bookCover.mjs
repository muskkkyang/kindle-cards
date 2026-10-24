import path from "node:path";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { MAX_MEDIA_BYTES } from "./mediaStore.mjs";
import { imageType } from "./screenshotStore.mjs";
import { extractKfxMetadata } from "./kfxCover.mjs";

export const MAX_BOOK_BYTES = 64 * 1024 * 1024;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: true,
});
const array = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value) => String(value?.["#text"] ?? value ?? "").trim();

async function zipBytes(zip, name, limit) {
  const entry = zip.file(name);
  if (
    !entry ||
    !Number.isSafeInteger(entry._data?.uncompressedSize) ||
    entry._data.uncompressedSize > limit
  )
    throw new Error("电子书封面或元数据缺失或超过大小限制。");
  const bytes = await entry.async("nodebuffer");
  if (bytes.length > limit) throw new Error("电子书内容超过大小限制。");
  return bytes;
}

function parseXml(bytes) {
  const source = bytes.toString("utf8");
  if (
    /<!DOCTYPE|<!ENTITY/iu.test(source) ||
    XMLValidator.validate(source) !== true
  )
    throw new Error("电子书元数据 XML 无效。");
  return xmlParser.parse(source);
}

async function epubCover(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const container = parseXml(
    await zipBytes(zip, "META-INF/container.xml", 1024 * 1024),
  );
  const root = array(container.container?.rootfiles?.rootfile)[0]?.[
    "@_full-path"
  ];
  if (
    typeof root !== "string" ||
    root.startsWith("/") ||
    root.split("/").includes("..")
  )
    throw new Error("EPUB 内容路径无效。");
  const pkg = parseXml(await zipBytes(zip, root, 2 * 1024 * 1024)).package;
  const metadata = pkg?.metadata;
  const items = array(pkg?.manifest?.item);
  const coverId = array(metadata?.meta).find(
    (item) => item["@_name"] === "cover",
  )?.["@_content"];
  const coverItem =
    items.find((item) =>
      String(item["@_properties"] || "")
        .split(/\s/u)
        .includes("cover-image"),
    ) || items.find((item) => coverId && item["@_id"] === coverId);
  let cover = null;
  if (coverItem) {
    const href = decodeURIComponent(String(coverItem["@_href"] || ""));
    if (/^[a-z]+:|^[/\\]/iu.test(href) || href.includes("\\"))
      throw new Error("EPUB 封面路径无效。");
    const name = path.posix.normalize(
      path.posix.join(path.posix.dirname(root), href),
    );
    if (name.startsWith("../")) throw new Error("EPUB 封面路径无效。");
    cover = await zipBytes(zip, name, MAX_MEDIA_BYTES);
  }
  return {
    title: text(array(metadata?.title)[0]),
    authors: array(metadata?.creator).map(text).filter(Boolean),
    cover,
  };
}

function mobiCover(bytes) {
  if (bytes.length < 86 || bytes.toString("ascii", 60, 68) !== "BOOKMOBI")
    throw new Error("不是支持的 MOBI/AZW 电子书。");
  const count = bytes.readUInt16BE(76);
  if (!count || 78 + count * 8 > bytes.length)
    throw new Error("电子书记录表无效。");
  const offsets = Array.from({ length: count }, (_, i) =>
    bytes.readUInt32BE(78 + i * 8),
  );
  if (
    offsets.some(
      (offset, i) =>
        offset < 78 + count * 8 ||
        offset >= bytes.length ||
        (i && offset <= offsets[i - 1]),
    )
  )
    throw new Error("电子书记录边界无效。");
  const record = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= count)
      throw new Error("电子书图片记录无效。");
    return bytes.subarray(offsets[index], offsets[index + 1] ?? bytes.length);
  };
  const header = record(0);
  if (header.length < 132 || header.toString("ascii", 16, 20) !== "MOBI")
    throw new Error("MOBI 元数据头无效。");
  const headerLength = header.readUInt32BE(20);
  if (headerLength < 116 || 16 + headerLength > header.length)
    throw new Error("MOBI 头长度无效。");
  const decoder = new TextDecoder(
    header.readUInt32BE(28) === 65001 ? "utf-8" : "windows-1252",
  );
  const titleOffset = header.readUInt32BE(84);
  const titleLength = header.readUInt32BE(88);
  let title =
    titleOffset + titleLength <= header.length
      ? decoder
          .decode(header.subarray(titleOffset, titleOffset + titleLength))
          .trim()
      : "";
  const authors = [];
  let asin = "";
  let coverOffset;
  let thumbnailOffset;
  const start = 16 + headerLength;
  if (
    header.readUInt32BE(128) & 0x40 &&
    header.toString("ascii", start, start + 4) === "EXTH"
  ) {
    if (start + 12 > header.length) throw new Error("EXTH 元数据无效。");
    const end = start + header.readUInt32BE(start + 4);
    const records = header.readUInt32BE(start + 8);
    if (end > header.length || records > 10_000)
      throw new Error("EXTH 元数据超出边界。");
    let cursor = start + 12;
    for (let i = 0; i < records; i++) {
      if (cursor + 8 > end) throw new Error("EXTH 记录无效。");
      const type = header.readUInt32BE(cursor);
      const length = header.readUInt32BE(cursor + 4);
      if (length < 8 || cursor + length > end)
        throw new Error("EXTH 记录长度无效。");
      const data = header.subarray(cursor + 8, cursor + length);
      if (type === 100) authors.push(decoder.decode(data).trim());
      if (type === 503) title = decoder.decode(data).trim();
      if (type === 113) asin = decoder.decode(data).trim();
      if (type === 201 && data.length === 4) coverOffset = data.readUInt32BE();
      if (type === 202 && data.length === 4)
        thumbnailOffset = data.readUInt32BE();
      cursor += length;
    }
  }
  const imageIndex = header.readUInt32BE(108);
  let cover = null;
  // Encrypted books may expose metadata, but their image records are not decoded.
  if (header.readUInt16BE(12) === 0) {
    const offset =
      coverOffset === 0xffffffff
        ? thumbnailOffset
        : (coverOffset ?? thumbnailOffset);
    if (
      offset !== undefined &&
      offset !== 0xffffffff &&
      imageIndex !== 0xffffffff
    )
      cover = record(imageIndex + offset);
  }
  return { title, authors: authors.filter(Boolean), asin, cover };
}

export async function extractBookCover(bytes, extension) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BOOK_BYTES)
    throw new Error("电子书超过 64 MB，已跳过。");
  const result =
    extension.toLowerCase() === ".epub"
      ? await epubCover(bytes)
      : extension.toLowerCase() === ".kfx"
        ? extractKfxMetadata(bytes)
        : mobiCover(bytes);
  if (
    !result.title ||
    result.title.length > 1000 ||
    result.authors.some((author) => author.length > 1000)
  )
    throw new Error("电子书缺少有效书名或作者元数据。");
  if (result.cover) {
    if (result.cover.length > MAX_MEDIA_BYTES)
      throw new Error("电子书封面超过 5 MB。");
    imageType(result.cover);
  }
  return result;
}

export function matchBookCovers(books, candidates) {
  const normalize = (value) =>
    value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
  const covers = {};
  let ambiguous = 0;
  const headerKey = (value) =>
    normalize(value)
      .replace(/\([^()]*\b(?:z-library|z-lib|1lib)\.[^()]*\)/giu, "")
      .replace(/[^\p{L}\p{N}+#]/gu, "");
  for (const book of books) {
    const sameTitle = candidates.filter(
      (candidate) => normalize(candidate.title) === normalize(book.title),
    );
    // A known author must match; a title alone must identify exactly one book.
    const metadataMatches = book.author.trim()
      ? sameTitle.filter((candidate) =>
          candidate.authors.some(
            (author) => normalize(author) === normalize(book.author),
          ),
        )
      : sameTitle;
    const sourceHeader = book.author.trim()
      ? `${book.title} (${book.author})`
      : book.title;
    const matching = candidates.filter(
      (candidate) =>
        metadataMatches.includes(candidate) ||
        (candidate.sourceTitle &&
          headerKey(candidate.sourceTitle) === headerKey(sourceHeader)) ||
        headerKey(candidate.title) === headerKey(sourceHeader) ||
        candidate.authors.some(
          (author) =>
            headerKey(`${candidate.title} (${author})`) ===
            headerKey(sourceHeader),
        ),
    );
    const matches = [
      ...new Map(
        matching.map((candidate) => [
          JSON.stringify([
            candidate.authors.map(normalize).sort(),
            candidate.url,
          ]),
          candidate,
        ]),
      ).values(),
    ];
    if (matches.length > 1) ambiguous++;
    if (matches.length === 1 && matches[0].url)
      covers[JSON.stringify([book.title.trim(), book.author.trim()])] =
        matches[0].url;
  }
  return { covers, ambiguous };
}
