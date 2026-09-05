import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [availableWidth, setAvailableWidth] = useState(420);
    const setCardRef = useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    useEffect(() => {
      const stage = stageRef.current;
      if (!stage) return undefined;

      const measure = () =>
        setAvailableWidth(Math.max(180, stage.clientWidth - 32));
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
    const quoteScale =
      size === "landscape" ? "fixedText" : getQuoteScale(quote);
    const dimensions = getCardDimensions(
      size,
      template,
      quote,
      memo.comment || "",
    );
    const previewScale = Math.min(1, availableWidth / dimensions.width);
    const heatmap = buildReadingHeatmap(memos, size === "landscape" ? 18 : 26);
    useLayoutEffect(() => {
      const card = contentRef.current;
      if (!card) return;
      const main = card.querySelector<HTMLElement>(".cardMain");
      if (!main) return;
      const texts = [
        ...main.querySelectorAll<HTMLElement>(".quoteText, .commentText"),
      ];
      texts.forEach((text) => {
        text.style.fontSize = "";
      });
      const sizes = texts.map((text) =>
        Number.parseFloat(getComputedStyle(text).fontSize),
      );
      let scale = 1;
      while (main.scrollHeight > main.clientHeight + 1 && scale > 0.38) {
        scale -= 0.025;
        texts.forEach((text, index) => {
          text.style.fontSize = `${sizes[index] * scale}px`;
        });
      }
      card.dataset.overflow = String(main.scrollHeight > main.clientHeight + 2);
    }, [memo, theme, size, template, dimensions.height]);

    return (
      <div
        ref={stageRef}
        className="previewStage"
        style={{ height: Math.ceil(dimensions.height * previewScale) + 34 }}
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
          {theme === "receipt" ? (
            <>
              <header className="receiptHeader">
                <span>READING RECEIPT</span>
                <strong>Kindle Cards</strong>
                <p>一页阅读 · 一份留存</p>
              </header>
              <div className="cardMain receiptMain">
                <p className="quoteText">{renderMemoText(quote)}</p>
                {template === "comment" && memo.comment && memo.quote && (
                  <p className="commentText">{memo.comment}</p>
                )}
                {memo.tags.length > 0 && (
                  <div className="receiptTags">
                    {memo.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <footer className="receiptFooter">
                <div className="receiptSource">{source}</div>
                <div className="receiptRow">
                  <span>DATE</span>
                  <strong>{date}</strong>
                </div>
                <div className="receiptRow">
                  <span>READER</span>
                  <strong>Muskkk</strong>
                </div>
                <div className="receiptRow">
                  <span>LIBRARY</span>
                  <strong>
                    {memoCount} MEMOS · {bookCount} BOOKS
                  </strong>
                </div>
                <div className="receiptBarcode" aria-hidden="true">
                  {Array.from({ length: 65 }, (_, i) => (
                    <i
                      key={i}
                      style={{
                        width:
                          ((memo.id.charCodeAt(i % memo.id.length) || 1) % 3) +
                          1,
                      }}
                    />
                  ))}
                </div>
                <p>KEEP WHAT MOVES YOU</p>
              </footer>
            </>
          ) : (
            <>
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
                <strong>Kindle Cards</strong>
              </div>
            </>
          )}
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
