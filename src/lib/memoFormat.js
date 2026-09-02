function clean(value) {
  return String(value || "").trim();
}

export function formatMemoText(memo) {
  const quote = clean(memo.quote);
  const comment = clean(memo.comment);
  const source = [
    clean(memo.title) && `《${clean(memo.title)}》`,
    clean(memo.author),
  ]
    .filter(Boolean)
    .join(" ");
  const tags = (memo.tags || [])
    .map((tag) => `#${clean(tag)}`)
    .filter((tag) => tag.length > 1)
    .join(" ");

  return [quote, comment, source, tags].filter(Boolean).join("\n\n");
}
