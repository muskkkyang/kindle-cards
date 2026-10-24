import JSZip from "jszip";
import { makeBinaryWriter, IonTypes } from "ion-js";

function uint(value) {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128))) bytes.unshift(value & 127);
  bytes[bytes.length - 1] |= 128;
  return Buffer.from(bytes);
}
function tagged(type, bytes) {
  return Buffer.concat([
    bytes.length < 14
      ? Buffer.from([(type << 4) | bytes.length])
      : Buffer.concat([Buffer.from([(type << 4) | 14]), uint(bytes.length)]),
    bytes,
  ]);
}
function ion(value) {
  if (typeof value === "string") return tagged(8, Buffer.from(value));
  if (typeof value === "number") {
    const bytes = [];
    while (value) {
      bytes.unshift(value & 255);
      value = Math.floor(value / 256);
    }
    return tagged(2, Buffer.from(bytes));
  }
  if (Array.isArray(value)) return tagged(11, Buffer.concat(value.map(ion)));
  if (value.symbol !== undefined) {
    const bytes = [];
    let n = value.symbol;
    while (n) {
      bytes.unshift(n & 255);
      n = Math.floor(n / 256);
    }
    return tagged(7, Buffer.from(bytes));
  }
  return tagged(
    13,
    Buffer.concat(
      Object.entries(value).flatMap(([key, item]) => [
        uint(Number(key)),
        ion(item),
      ]),
    ),
  );
}
const ionMarker = Buffer.from([0xe0, 1, 0, 0xea]);
const ionDocument = (value) => Buffer.concat([ionMarker, ion(value)]);

export function kfxFixture({
  title = "匿名书籍",
  author = "示例作者",
  cover = coverPng,
  protectedResource = false,
} = {}) {
  const w = makeBinaryWriter();
  w.setAnnotations(["$ion_symbol_table"]);
  w.stepIn(IonTypes.STRUCT);
  w.writeFieldName("imports");
  w.stepIn(IonTypes.LIST);
  w.stepIn(IonTypes.STRUCT);
  w.writeFieldName("name");
  w.writeString("YJ_symbols");
  w.writeFieldName("version");
  w.writeInt(10);
  w.writeFieldName("max_id");
  w.writeInt(600);
  w.stepOut();
  w.stepOut();
  w.writeFieldName("symbols");
  w.stepIn(IonTypes.LIST);
  w.writeString("cover");
  w.writeString("resource/cover");
  w.stepOut();
  w.stepOut();
  w.close();
  const symbols = Buffer.from(w.getBytes());
  const metadata = {
    491: [
      {
        495: "kindle_title_metadata",
        258: [
          { 492: "title", 307: title },
          { 492: "author", 307: author },
          { 492: "cover_image", 307: { symbol: 601 } },
        ],
      },
    ],
  };
  const entries = [
    { type: 490, id: 348, payload: ionDocument(metadata) },
    { type: 164, id: 601, payload: ionDocument({ 165: { symbol: 602 } }) },
    {
      type: 417,
      id: 602,
      payload: cover,
      flags: protectedResource ? { 411: 1 } : {},
    },
  ].map((entry) => {
    const flags = ionDocument(entry.flags || {});
    const header = Buffer.alloc(10);
    header.write("ENTY");
    header.writeUInt16LE(1, 4);
    header.writeUInt32LE(10 + flags.length, 6);
    return { ...entry, bytes: Buffer.concat([header, flags, entry.payload]) };
  });
  const index = Buffer.alloc(entries.length * 24);
  let offset = 0;
  entries.forEach((entry, i) => {
    index.writeUInt32LE(entry.id, i * 24);
    index.writeUInt32LE(entry.type, i * 24 + 4);
    index.writeBigUInt64LE(BigInt(offset), i * 24 + 8);
    index.writeBigUInt64LE(BigInt(entry.bytes.length), i * 24 + 16);
    offset += entry.bytes.length;
  });
  const symbolsOffset = 18 + index.length;
  const info = ionDocument({
    413: 18,
    414: index.length,
    415: symbolsOffset,
    416: symbols.length,
  });
  const header = Buffer.alloc(18);
  header.write("CONT");
  header.writeUInt16LE(2, 4);
  header.writeUInt32LE(18 + index.length + symbols.length + info.length, 6);
  header.writeUInt32LE(symbolsOffset + symbols.length, 10);
  header.writeUInt32LE(info.length, 14);
  return Buffer.concat([
    header,
    index,
    symbols,
    info,
    ...entries.map((entry) => entry.bytes),
  ]);
}

export const coverPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

export async function epubFixture(
  title = "测试书籍",
  author = "作者甲",
  cover = coverPng,
  epub3 = true,
) {
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
  );
  zip.file(
    "OEBPS/book.opf",
    `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator>${epub3 ? "" : '<meta name="cover" content="jacket"/>'}</metadata><manifest><item id="jacket" href="images/cover.png" media-type="image/png" ${epub3 ? 'properties="cover-image"' : ""}/></manifest></package>`,
  );
  zip.file("OEBPS/images/cover.png", cover);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function mobiFixture({
  title = "测试书籍",
  author = "作者甲",
  cover = coverPng,
  encrypted = false,
} = {}) {
  const values = [
    [100, Buffer.from(author)],
    [503, Buffer.from(title)],
    [201, Buffer.alloc(4)],
  ];
  const records = values.map(([type, value]) => {
    const entry = Buffer.alloc(8 + value.length);
    entry.writeUInt32BE(type, 0);
    entry.writeUInt32BE(entry.length, 4);
    value.copy(entry, 8);
    return entry;
  });
  const exth = Buffer.alloc(12);
  exth.write("EXTH");
  exth.writeUInt32BE(
    12 + records.reduce((sum, item) => sum + item.length, 0),
    4,
  );
  exth.writeUInt32BE(records.length, 8);
  const header = Buffer.alloc(16 + 232);
  header.writeUInt16BE(encrypted ? 2 : 0, 12);
  header.write("MOBI", 16);
  header.writeUInt32BE(232, 20);
  header.writeUInt32BE(65001, 28);
  header.writeUInt32BE(1, 108);
  header.writeUInt32BE(0x40, 128);
  const first = Buffer.concat([header, exth, ...records]);
  const pdb = Buffer.alloc(96);
  pdb.write("BOOKMOBI", 60);
  pdb.writeUInt16BE(2, 76);
  pdb.writeUInt32BE(pdb.length, 78);
  pdb.writeUInt32BE(pdb.length + first.length, 86);
  return Buffer.concat([pdb, first, cover]);
}
