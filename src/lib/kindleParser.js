const CLIPPING_SEPARATOR = /={8,}/g;

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function parseTitleLine(line) {
  const trimmed = normalizeWhitespace(line);
  const match = trimmed.match(/^(.*?)\s*[（(]([^()（）]+)[）)]$/);
  if (!match) return { title: trimmed || "未知书籍", author: "" };
  return { title: match[1].trim(), author: match[2].trim() };
}

function parseMetaLine(line) {
  const lower = line.toLowerCase();
  let type = "highlight";

  if (/note|笔记|备注/.test(lower)) type = "note";
  if (/bookmark|书签/.test(lower)) type = "bookmark";
  if (/highlight|标注|划线/.test(lower)) type = "highlight";

  const locationMatch = line.match(
    /(?:Location|位置|Loc\.)\s*([\d,]+)(?:\s*[-–—]\s*([\d,]+))?/i,
  );
  const pageMatch = line.match(/(?:page|页码|第)\s*([\d,]+)/i);
  const dateMatch = line.match(/(?:Added on|添加于|加入于|创建于)\s*(.+)$/i);

  return {
    type,
    locationStart: locationMatch
      ? Number(locationMatch[1].replace(/,/g, ""))
      : null,
    locationEnd:
      locationMatch && locationMatch[2]
        ? Number(locationMatch[2].replace(/,/g, ""))
        : null,
    page: pageMatch ? pageMatch[1] : "",
    addedAtRaw: dateMatch ? dateMatch[1].trim() : "",
  };
}

function extractTagsAndComment(text) {
  const body = normalizeWhitespace(text);
  const tags = Array.from(
    body.matchAll(/#([\p{L}\p{N}_\-\u4e00-\u9fa5]+)/gu),
  ).map((match) => match[1]);
  const comment = normalizeWhitespace(
    body.replace(/#([\p{L}\p{N}_\-\u4e00-\u9fa5]+)/gu, " "),
  );
  return { tags: [...new Set(tags)], comment };
}

function makeFingerprint(parts) {
  return [
    parts.title,
    parts.author,
    parts.locationStart || "",
    parts.locationEnd || "",
    normalizeWhitespace(parts.quote || parts.comment).slice(0, 180),
  ].join("|");
}

function makeMergeAnchor(memo) {
  const position =
    memo.locationStart != null
      ? `location:${memo.locationStart}-${memo.locationEnd ?? memo.locationStart}`
      : memo.page
        ? `page:${memo.page}`
        : `content:${normalizeWhitespace(memo.quote || memo.comment).slice(0, 180)}`;
  return [
    memo.title,
    memo.author,
    memo.type || (memo.quote ? "highlight" : "note"),
    position,
  ].join("|");
}

function shouldMerge(highlight, note) {
  if (!highlight || !note) return false;
  if (highlight.title !== note.title || highlight.author !== note.author)
    return false;
  if (highlight.locationStart != null && note.locationStart != null) {
    return Math.abs(highlight.locationStart - note.locationStart) <= 4;
  }
  if (highlight.page && note.page) {
    return highlight.page === note.page;
  }
  return false;
}

function noteQuality(entry) {
  const parsed = extractTagsAndComment(entry.rawNote);
  const chineseCharacters = (parsed.comment.match(/[\u3400-\u9fff]/g) || [])
    .length;
  const words = parsed.comment.split(/\s+/).filter(Boolean).length;
  return (
    chineseCharacters * 3 +
    parsed.comment.length +
    words * 2 +
    parsed.tags.length * 4
  );
}

export function parseKindleClippings(rawText) {
  const chunks = normalizeWhitespace(rawText).split(CLIPPING_SEPARATOR);
  const entries = [];

  for (const chunk of chunks) {
    const lines = normalizeWhitespace(chunk)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 3) continue;

    const { title, author } = parseTitleLine(lines[0]);
    const meta = parseMetaLine(lines[1]);
    const content = normalizeWhitespace(lines.slice(2).join("\n"));
    if (!content) continue;

    entries.push({
      id: "",
      title,
      author,
      type: meta.type,
      quote: meta.type === "highlight" ? content : "",
      rawNote: meta.type === "note" ? content : "",
      comment: "",
      tags: [],
      locationStart: meta.locationStart,
      locationEnd: meta.locationEnd,
      page: meta.page,
      addedAtRaw: meta.addedAtRaw,
    });
  }

  const memos = [];
  const usedNotes = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.type !== "highlight") continue;

    const memo = { ...entry };
    const noteIndexes = [];
    for (
      let candidateIndex = index + 1;
      candidateIndex < entries.length;
      candidateIndex += 1
    ) {
      const candidate = entries[candidateIndex];
      if (candidate.type === "highlight") break;
      if (
        candidate.type === "note" &&
        !usedNotes.has(candidateIndex) &&
        shouldMerge(entry, candidate)
      ) {
        noteIndexes.push(candidateIndex);
      }
    }

    if (noteIndexes.length > 0) {
      noteIndexes.forEach((noteIndex) => usedNotes.add(noteIndex));
      const bestNoteIndex = noteIndexes.reduce((best, current) =>
        noteQuality(entries[current]) > noteQuality(entries[best])
          ? current
          : best,
      );
      const parsed = extractTagsAndComment(entries[bestNoteIndex].rawNote);
      const tags = noteIndexes.flatMap(
        (noteIndex) => extractTagsAndComment(entries[noteIndex].rawNote).tags,
      );
      memo.rawNote = entries[bestNoteIndex].rawNote;
      memo.comment = parsed.comment;
      memo.tags = [...new Set(tags)];
    }

    memo.id = makeFingerprint(memo);
    memos.push(memo);
  }

  entries.forEach((entry, index) => {
    if (entry.type !== "note" || usedNotes.has(index)) return;
    const parsed = extractTagsAndComment(entry.rawNote);
    const memo = {
      ...entry,
      quote: "",
      comment: parsed.comment,
      tags: parsed.tags,
    };
    memo.id = makeFingerprint(memo);
    memos.push(memo);
  });

  const seen = new Set();
  return memos.filter((memo) => {
    if (seen.has(memo.id)) return false;
    seen.add(memo.id);
    return true;
  });
}

export function mergeMemos(
  existing,
  incoming,
  importedAt = new Date().toISOString(),
) {
  const byId = new Map(existing.map((memo) => [memo.id, memo]));
  const byAnchor = new Map(
    existing.map((memo) => [makeMergeAnchor(memo), memo]),
  );
  let added = 0;
  let updated = 0;

  for (const memo of incoming) {
    const current = byId.get(memo.id) || byAnchor.get(makeMergeAnchor(memo));
    if (current) {
      const next = {
        ...current,
        ...memo,
        id: current.id,
        favorite: current.favorite || false,
        importedAt: current.importedAt,
      };
      const changed = [
        "title",
        "author",
        "quote",
        "comment",
        "tags",
        "locationStart",
        "locationEnd",
        "page",
        "addedAtRaw",
      ].some(
        (key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]),
      );
      if (changed) {
        next.importedAt = importedAt;
        byId.set(current.id, next);
        byAnchor.set(makeMergeAnchor(next), next);
        updated += 1;
      }
      continue;
    }
    byId.set(memo.id, {
      ...memo,
      importedAt,
      favorite: false,
    });
    byAnchor.set(makeMergeAnchor(memo), memo);
    added += 1;
  }

  return { memos: Array.from(byId.values()), added, updated };
}
