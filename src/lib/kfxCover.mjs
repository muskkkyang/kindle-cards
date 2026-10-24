import {
  Catalog,
  SharedSymbolTable,
  makeReader,
  makeBinaryWriter,
  IonTypes,
} from "ion-js";

const catalog = new Catalog();
catalog.add(
  new SharedSymbolTable(
    "YJ_symbols",
    10,
    Array.from({ length: 2000 }, (_, i) => `$${i + 10}`),
  ),
);
const marker = Buffer.from([0xe0, 1, 0, 0xea]);

function symbolPrefix(symbols = [], maxId = 2000, version = 10) {
  const w = makeBinaryWriter();
  w.setAnnotations(["$ion_symbol_table"]);
  w.stepIn(IonTypes.STRUCT);
  w.writeFieldName("imports");
  w.stepIn(IonTypes.LIST);
  w.stepIn(IonTypes.STRUCT);
  w.writeFieldName("name");
  w.writeString("YJ_symbols");
  w.writeFieldName("version");
  w.writeInt(version);
  w.writeFieldName("max_id");
  w.writeInt(maxId);
  w.stepOut();
  w.stepOut();
  w.writeFieldName("symbols");
  w.stepIn(IonTypes.LIST);
  for (const symbol of symbols) {
    if (symbol === null) w.writeNull(IonTypes.STRING);
    else w.writeString(symbol);
  }
  w.stepOut();
  w.stepOut();
  w.close();
  return Buffer.from(w.getBytes());
}

function readValue(reader, depth = 0) {
  if (depth > 24) throw new Error("KFX 元数据嵌套过深。");
  const type = reader.type();
  if (type?.isContainer && !reader.isNull()) {
    const value = type === IonTypes.STRUCT ? Object.create(null) : [];
    reader.stepIn();
    while (reader.next()) {
      const name = reader.fieldName();
      const child = readValue(reader, depth + 1);
      if (Array.isArray(value)) value.push(child);
      else value[name] = child;
    }
    reader.stepOut();
    return value;
  }
  const value = reader.value();
  return typeof value === "bigint" ? Number(value) : value;
}

function ionValue(bytes, prefix) {
  if (!bytes.subarray(0, 4).equals(marker))
    throw new Error("KFX Ion 标识无效。");
  const reader = makeReader(
    Buffer.concat([prefix, bytes.subarray(4)]),
    catalog,
  );
  if (!reader.next()) throw new Error("KFX 元数据为空。");
  return readValue(reader);
}

function localSymbols(bytes) {
  // Read the standard Ion local-symbol-table as data by changing its annotation
  // to the other standard symbol-table annotation. Field IDs remain unchanged.
  const copy = Buffer.from(bytes);
  let cursor = 4;
  if (copy[cursor] >> 4 !== 14) throw new Error("KFX 符号表无效。");
  const length = copy[cursor++] & 15;
  if (length === 14) {
    while (cursor < copy.length && !(copy[cursor++] & 128)) {
      /* VarUInt length */
    }
  }
  if (copy[cursor++] !== 0x81 || copy[cursor] !== 0x83)
    throw new Error("KFX 符号表注解无效。");
  copy[cursor] = 0x89;
  const reader = makeReader(copy, catalog);
  if (!reader.next()) throw new Error("KFX 缺少符号表。");
  return readValue(reader);
}

export function extractKfxMetadata(bytes) {
  if (
    bytes.length < 18 ||
    bytes.toString("ascii", 0, 4) !== "CONT" ||
    ![1, 2].includes(bytes.readUInt16LE(4))
  )
    throw new Error("不是可读取元数据的 KFX 容器。");
  const slice = (offset, length, limit = 4 * 1024 * 1024) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      length > limit ||
      offset + length > bytes.length
    )
      throw new Error("KFX 元数据边界无效。");
    return bytes.subarray(offset, offset + length);
  };
  const headerLength = bytes.readUInt32LE(6);
  const info = ionValue(
    slice(bytes.readUInt32LE(10), bytes.readUInt32LE(14)),
    symbolPrefix(),
  );
  if (info.$410 || info.$411)
    throw new Error("KFX 容器元数据受保护或使用不支持的压缩。");
  const table = localSymbols(slice(info.$415, info.$416));
  const imported = table.imports?.find((item) => item.name === "YJ_symbols");
  if (
    !imported ||
    !Number.isInteger(imported.max_id) ||
    imported.max_id < 10 ||
    imported.max_id > 2009 ||
    !Array.isArray(table.symbols) ||
    table.symbols.length > 20_000
  )
    throw new Error("KFX 符号表超出支持范围。");
  const prefix = symbolPrefix(
    table.symbols,
    imported.max_id - 9,
    imported.version,
  );
  const index = slice(info.$413, info.$414);
  if (index.length % 24) throw new Error("KFX 索引长度无效。");
  const entities = [];
  for (let i = 0; i < index.length; i += 24) {
    const offset = Number(index.readBigUInt64LE(i + 8));
    const length = Number(index.readBigUInt64LE(i + 16));
    const type = index.readUInt32LE(i + 4);
    const id = index.readUInt32LE(i);
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      headerLength + offset + length > bytes.length
    )
      throw new Error("KFX 资源索引无效。");
    entities.push({ type, id, offset: headerLength + offset, length });
  }
  function entityBytes(entry, limit = 4 * 1024 * 1024) {
    const raw = slice(entry.offset, entry.length, limit);
    if (raw.length < 10 || raw.toString("ascii", 0, 4) !== "ENTY")
      throw new Error("KFX 资源头无效。");
    const size = raw.readUInt32LE(6);
    const flags = ionValue(slice(entry.offset + 10, size - 10), symbolPrefix());
    if (flags.$410 || flags.$411)
      throw new Error("KFX 资源受保护或压缩，无法直接读取。");
    return raw.subarray(size);
  }
  const metadata = entities.find((entry) => entry.type === 490);
  if (!metadata) throw new Error("KFX 缺少书籍元数据。");
  const groups = ionValue(entityBytes(metadata), prefix).$491 || [];
  const titleGroup = groups.find(
    (group) => group.$495 === "kindle_title_metadata",
  );
  const fields = titleGroup?.$258 || [];
  const find = (name) =>
    fields.filter((item) => item.$492 === name).map((item) => item.$307);
  const title = find("title")[0];
  const authors = find("author").filter((value) => typeof value === "string");
  const legacy = entities.find((entry) => entry.type === 258);
  const legacyFields = legacy ? ionValue(entityBytes(legacy), prefix) : {};
  const coverId = find("cover_image")[0] || legacyFields.$424;
  const symbolId = (name) => table.symbols.indexOf(name) + imported.max_id + 1;
  const resource = entities.find(
    (entry) => entry.type === 164 && entry.id === symbolId(coverId),
  );
  let cover = null;
  let location = "";
  if (resource) {
    const data = ionValue(entityBytes(resource), prefix);
    location = data.$165 || "";
    const raw = entities.find(
      (entry) => entry.type === 417 && entry.id === symbolId(location),
    );
    if (raw) cover = entityBytes(raw, 5 * 1024 * 1024 + 1024);
  }
  if (typeof title !== "string") throw new Error("KFX 缺少书名。");
  return {
    title,
    authors,
    cover,
    thumbnail: location || coverId || "",
    identifiers: ["ASIN", "asset_id", "content_id", "book_id"]
      .flatMap(find)
      .filter(
        (value) =>
          typeof value === "string" && /^[a-z0-9_-]{6,100}$/iu.test(value),
      ),
  };
}
