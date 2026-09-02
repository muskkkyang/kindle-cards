import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  buildReadingHeatmap,
  compactTitle,
  formatCardDate,
  formatLocation,
  getCardDimensions,
  getQuoteScale,
  parseMemoDate,
} from "../lib/cardUtils";
import type { Memo, SizePreset, Template, Theme } from "../types";

function renderMemoText(text: string) {
  const lines = text.split("\n");
  const tagPattern = /#[\p{L}\p{N}_\-\u4e00-\u9fa5]+/gu;

  return lines.flatMap((line, lineIndex) => {
    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    Array.from(line.matchAll(tagPattern)).forEach((match, tagIndex) => {
      const index = match.index ?? 0;
      if (index > cursor) nodes.push(line.slice(cursor, index));
      nodes.push(
        <span
          className="inlineMemoTag"
          key={`${lineIndex}-${tagIndex}-${match[0]}`}
        >
          {match[0]}
        </span>,
      );
      cursor = index + match[0].length;
    });

    if (cursor < line.length) nodes.push(line.slice(cursor));
    if (lineIndex < lines.length - 1)
      nodes.push(<br key={`br-${lineIndex}`} />);
    return nodes;
  });
}

type CardPreviewProps = {
  memo: Memo;
  template: Template;
  theme: Theme;
  size: SizePreset;
  memoCount: number;
  bookCount: number;
  memos: Memo[];
};

export const CardPreview = React.forwardRef<HTMLDivElement, CardPreviewProps>(
  (
    { memo, template, theme, size, memoCount, bookCount, memos },
    forwardedRef,
  ) => {
    const stageRef = useRef<HTMLDivElement>(null);
    const [availableWidth, setAvailableWidth] = useState(420);
    const setCardRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    useEffect(() => {
      const stage = stageRef.current;
      if (!stage) return undefined;

      const measure = () =>
        setAvailableWidth(Math.max(280, Math.min(420, stage.clientWidth)));
      measure();

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
      }

      const observer = new ResizeObserver(measure);
      observer.observe(stage);
      return () => observer.disconnect();
    }, []);

    const location = formatLocation(memo);
    const quote = (memo.quote || memo.comment || "").trim();
    const memoDate = parseMemoDate(memo);
    const date = formatCardDate(memoDate?.toISOString() || memo.importedAt);
    const source = [compactTitle(memo.title), memo.author, location]
      .filter(Boolean)
      .join(" / ");
    const quoteScale = size === "flomo" ? "fixedText" : getQuoteScale(quote);
    const dimensions = getCardDimensions(
      size,
      template,
      quote,
      memo.comment || "",
    );
    const previewScale = Math.min(1, availableWidth / dimensions.width);
    const heatmap = buildReadingHeatmap(memos, size === "flomo" ? 18 : 26);

    return (
      <div
        ref={stageRef}
        className="previewStage"
        style={{ height: Math.ceil(dimensions.height * previewScale) + 2 }}
      >
        <div
          ref={setCardRef}
          data-memo-id={memo.id}
          className={`shareCard ${theme} ${template} ${size} ${quoteScale}`}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            transform: `scale(${previewScale})`,
          }}
        >
          <div className="cardHeader">
            <div className="quoteMark">“</div>
            <div className="cardIdentity">
              <strong>Muskkk</strong>
              <span>{date}</span>
            </div>
          </div>

          <div className="cardMain">
            <p className="quoteText">{renderMemoText(quote)}</p>
            {template === "comment" && memo.comment && memo.quote && (
              <p className="commentText">{memo.comment}</p>
            )}
            {template === "memo" && (
              <div className="cardTags">
                {memo.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
          </div>

          <div className="cardMetaRow">
            <strong>
              {memoCount} MEMOS · {bookCount} BOOKS
            </strong>
            <ReadingHeatmap heatmap={heatmap} />
          </div>

          <div className="cardRule" />

          <div className="cardFooter">
            <span className="sourceLine">{source}</span>
            <strong>Kindle Memo</strong>
          </div>
        </div>
      </div>
    );
  },
);

CardPreview.displayName = "CardPreview";

function ReadingHeatmap({
  heatmap,
}: {
  heatmap: ReturnType<typeof buildReadingHeatmap>;
}) {
  const activeDays = heatmap.cells.filter((cell) => cell.count > 0).length;

  return (
    <div
      className="readingHeatmap"
      aria-label={`近期开启阅读的天数：${activeDays}`}
    >
      <span className="srOnly">近期开启阅读的天数：{activeDays}</span>
      <div aria-hidden="true">
        <div
          className="heatmapMonths"
          style={{ gridTemplateColumns: `repeat(${heatmap.weekCount}, 1fr)` }}
        >
          {heatmap.months.map((month, index) => (
            <span key={`${month}-${index}`}>{month}</span>
          ))}
        </div>
        <div className="heatmapBody">
          <div className="heatmapWeekdays">
            <span />
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
          </div>
          <div
            className="heatmapCells"
            style={{ gridTemplateColumns: `repeat(${heatmap.weekCount}, 1fr)` }}
          >
            {heatmap.cells.map((cell) => (
              <span
                key={cell.key}
                className={`heatCell level${cell.level}`}
                title={`${cell.key}: ${cell.count}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
