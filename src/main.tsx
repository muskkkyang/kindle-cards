import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileUp,
  Hash,
  ImageDown,
  Library,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Tags,
  Upload,
} from 'lucide-react';
import { formatFlomoMemo } from './lib/flomoFormat.js';
import { mergeMemos, parseKindleClippings } from './lib/kindleParser.js';
import './styles.css';

type Memo = {
  id: string;
  title: string;
  author: string;
  quote: string;
  comment: string;
  tags: string[];
  locationStart: number | null;
  locationEnd: number | null;
  page: string;
  addedAtRaw: string;
  importedAt?: string;
  favorite?: boolean;
};

type Template = 'quote' | 'comment' | 'memo';
type Theme = 'light' | 'dark' | 'paper';
type SizePreset = 'flomo' | 'square' | 'portrait' | 'wide';
type FilterMode = 'all' | 'recent' | 'untagged';
type MobileView = 'library' | 'studio';
type StatusTone = 'neutral' | 'working' | 'success' | 'error';

const STORAGE_KEY = 'kindle-flomo-cards:memos';
const SETTINGS_KEY = 'kindle-flomo-cards:settings';
const EXPORT_PIXEL_RATIO = 3;
const memoryStore = new Map<string, string>();

const sizePresets: Record<SizePreset, { label: string; width: number; height: number }> = {
  flomo: { label: 'Flomo 横卡', width: 720, height: 498 },
  square: { label: '朋友圈 1:1', width: 1080, height: 1080 },
  portrait: { label: '小红书 3:4', width: 1080, height: 1440 },
  wide: { label: '公众号横图', width: 1200, height: 675 },
};

function countContentLines(text: string, charsPerLine: number) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return normalized
    .split(/\n+/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.replace(/\s/g, '').length / charsPerLine)), 0);
}

function getCardDimensions(size: SizePreset, template: Template, quote: string, comment: string) {
  const preset = sizePresets[size];

  if (size !== 'flomo') {
    const quoteLines = countContentLines(quote, size === 'wide' ? 42 : 26);
    const commentLines = template === 'comment' ? countContentLines(comment, size === 'wide' ? 48 : 30) : 0;
    const extraHeight = Math.max(0, quoteLines - 5) * 58 + Math.max(0, commentLines - 2) * 42;
    return {
      width: preset.width,
      height: preset.height + extraHeight,
    };
  }

  const width = preset.width;
  const charsPerLine = 30;
  const quoteLines = countContentLines(quote, charsPerLine);
  const commentLines = template === 'comment' ? countContentLines(comment, Math.max(34, charsPerLine + 8)) : 0;
  const extraHeight = Math.max(0, quoteLines - 3) * 33 + Math.max(0, commentLines - 1) * 28;

  return {
    width,
    height: Math.max(498, 498 + extraHeight),
  };
}

function safeGet(key: string) {
  try {
    return window.localStorage?.getItem(key) || memoryStore.get(key) || '';
  } catch {
    return memoryStore.get(key) || '';
  }
}

function safeSet(key: string, value: string) {
  memoryStore.set(key, value);
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Keep the app usable in restricted browser contexts.
  }
}

function loadMemos(): Memo[] {
  try {
    const value = safeGet(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function loadSettings() {
  try {
    const value = safeGet(SETTINGS_KEY);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function formatLocation(memo: Memo) {
  if (memo.page) return `第 ${memo.page} 页`;
  if (memo.locationStart && memo.locationEnd) return `位置 ${memo.locationStart}-${memo.locationEnd}`;
  if (memo.locationStart) return `位置 ${memo.locationStart}`;
  return '';
}

function formatCardDate(value?: string) {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function getQuoteScale(text: string) {
  const length = text.replace(/\s/g, '').length;
  if (length <= 18) return 'shortText';
  if (length <= 48) return 'mediumText';
  if (length <= 92) return 'longText';
  return 'essayText';
}

function renderMemoText(text: string) {
  const lines = text.split('\n');
  const tagPattern = /#[\p{L}\p{N}_\-\u4e00-\u9fa5]+/gu;

  return lines.flatMap((line, lineIndex) => {
    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    Array.from(line.matchAll(tagPattern)).forEach((match, tagIndex) => {
      const index = match.index ?? 0;
      if (index > cursor) nodes.push(line.slice(cursor, index));
      nodes.push(
        <span className="inlineMemoTag" key={`${lineIndex}-${tagIndex}-${match[0]}`}>
          {match[0]}
        </span>,
      );
      cursor = index + match[0].length;
    });

    if (cursor < line.length) nodes.push(line.slice(cursor));
    if (lineIndex < lines.length - 1) nodes.push(<br key={`br-${lineIndex}`} />);
    return nodes;
  });
}

function compactTitle(title: string) {
  return title
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[\u2014-]+.*$/g, '')
    .trim() || title;
}

function getRecentCutoff(memos: Memo[]) {
  return memos.reduce((max, memo) => Math.max(max, Date.parse(memo.importedAt || '') || 0), 0);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseMemoDate(memo: Memo) {
  const raw = memo.addedAtRaw || '';
  const chineseDate = raw.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (chineseDate) {
    return new Date(Number(chineseDate[1]), Number(chineseDate[2]) - 1, Number(chineseDate[3]));
  }

  const parsedRaw = Date.parse(raw);
  if (!Number.isNaN(parsedRaw)) return new Date(parsedRaw);

  const parsedImported = Date.parse(memo.importedAt || '');
  if (!Number.isNaN(parsedImported)) return new Date(parsedImported);

  return null;
}

function buildReadingHeatmap(memos: Memo[], weekCount: number) {
  const counts = new Map<string, number>();
  const dates = memos.map(parseMemoDate).filter((date): date is Date => Boolean(date));

  dates.forEach((date) => {
    const key = toDateKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const latest = dates.reduce((max, date) => Math.max(max, date.getTime()), Date.now());
  const end = new Date(latest);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const start = new Date(end);
  start.setDate(end.getDate() - weekCount * 7 + 1);

  const cells = [];
  const monthLabels = new Map<number, string>();
  const seenMonthLabels = new Set<string>();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let week = 0; week < weekCount; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);
      const key = toDateKey(date);
      const count = counts.get(key) || 0;

      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (date.getDate() <= 7 && !monthLabels.has(week) && !seenMonthLabels.has(monthKey)) {
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
    months: Array.from({ length: weekCount }, (_, index) => monthLabels.get(index) || ''),
    weekCount,
  };
}

function App() {
  const settings = loadSettings();
  const initialMemos = loadMemos();
  const [memos, setMemos] = useState<Memo[]>(initialMemos);
  const [selectedId, setSelectedId] = useState<string>(() => initialMemos[0]?.id || '');
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [template, setTemplate] = useState<Template>(settings.template || 'quote');
  const [theme, setTheme] = useState<Theme>(settings.theme || 'dark');
  const [size, setSize] = useState<SizePreset>(settings.size || 'flomo');
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: 'neutral',
    text: '阅读数据只保存在这台电脑。',
  });
  const [pasteText, setPasteText] = useState('');
  const [mobileView, setMobileView] = useState<MobileView>('library');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedMemo = useMemo(
    () => memos.find((memo) => memo.id === selectedId) || memos[0],
    [memos, selectedId],
  );

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    memos.forEach((memo) => memo.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [memos]);

  const books = useMemo(() => new Set(memos.map((memo) => memo.title)).size, [memos]);
  const recentCutoff = useMemo(() => getRecentCutoff(memos), [memos]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return memos.filter((memo) => {
      const haystack = [memo.quote, memo.comment, memo.title, memo.author, ...memo.tags].join(' ').toLowerCase();
      if (needle && !haystack.includes(needle)) return false;
      if (activeTag && !memo.tags.includes(activeTag)) return false;
      if (filterMode === 'untagged' && memo.tags.length > 0) return false;
      if (filterMode === 'recent') return (Date.parse(memo.importedAt || '') || 0) === recentCutoff;
      return true;
    });
  }, [activeTag, filterMode, memos, query, recentCutoff]);

  function persist(nextMemos: Memo[]) {
    setMemos(nextMemos);
    safeSet(STORAGE_KEY, JSON.stringify(nextMemos));
    if (!selectedId && nextMemos[0]) setSelectedId(nextMemos[0].id);
  }

  function persistSettings(next: { template?: Template; theme?: Theme; size?: SizePreset }) {
    safeSet(SETTINGS_KEY, JSON.stringify({
      template,
      theme,
      size,
      ...next,
    }));
  }

  function importParsed(parsed: Memo[], importedAt = new Date().toISOString(), source = '文件') {
    if (parsed.length === 0) {
      setStatus({ tone: 'error', text: `${source} 中没有识别到 Kindle 摘录，请确认文件内容。` });
      return;
    }
    const result = mergeMemos(memos, parsed, importedAt);
    persist(result.memos);
    setFilterMode('recent');
    setActiveTag('');
    setSelectedId(parsed[0]?.id || result.memos[0]?.id || '');
    setStatus({
      tone: 'success',
      text: `${source} 已完成：新增 ${result.added} 条，更新 ${result.updated} 条，共 ${result.memos.length} 条。`,
    });
  }

  async function syncKindle() {
    setIsSyncing(true);
    setStatus({ tone: 'working', text: '正在查找通过 USB 连接的 Kindle...' });
    try {
      const response = await fetch('/api/kindle-clippings');
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '同步失败');
      importParsed(payload.memos, payload.importedAt, payload.source);
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : '没有找到 Kindle，请改用导入文件。' });
    } finally {
      setIsSyncing(false);
    }
  }

  async function importFile(file: File) {
    try {
      setStatus({ tone: 'working', text: `正在解析 ${file.name}...` });
      const text = await file.text();
      importParsed(parseKindleClippings(text), new Date().toISOString(), file.name);
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : '文件读取失败。' });
    }
  }

  function updateMemo(id: string, changes: Partial<Memo>) {
    persist(memos.map((memo) => (memo.id === id ? { ...memo, ...changes } : memo)));
  }

  async function exportCard(memo = selectedMemo, silent = false) {
    if (!cardRef.current || !memo) return;
    if (!silent) setIsExporting(true);
    const dimensions = getCardDimensions(size, template, memo.quote || memo.comment || '', memo.comment || '');
    const previousTransform = cardRef.current.style.transform;
    cardRef.current.style.transform = 'none';
    let dataUrl = '';

    try {
      dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: EXPORT_PIXEL_RATIO,
        width: dimensions.width,
        height: dimensions.height,
        style: {
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
        },
      });
      const link = document.createElement('a');
      link.download = `${compactTitle(memo.title).slice(0, 24)}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      if (!silent) setStatus({ tone: 'success', text: '卡片 PNG 已导出。' });
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : '卡片导出失败。' });
      if (silent) throw error;
    } finally {
      cardRef.current.style.transform = previousTransform;
      if (!silent) setIsExporting(false);
    }
  }

  async function exportBatch() {
    if (filtered.length === 0 || isExporting) return;
    const originalId = selectedMemo?.id || '';
    const batch = filtered.slice(0, 20);
    setIsExporting(true);
    setStatus({ tone: 'working', text: `正在导出 ${batch.length} 张卡片...` });
    try {
      for (const memo of batch) {
        setSelectedId(memo.id);
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        await exportCard(memo, true);
      }
      setStatus({ tone: 'success', text: `已导出 ${batch.length} 张卡片。` });
    } catch {
      setStatus({ tone: 'error', text: '批量导出中断，请允许浏览器下载多个文件后重试。' });
    } finally {
      setSelectedId(originalId);
      setIsExporting(false);
    }
  }

  async function copyForFlomo() {
    if (!selectedMemo) return;
    const text = formatFlomoMemo(selectedMemo);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setDidCopy(true);
    setStatus({ tone: 'success', text: '已复制为 flomo memo，可以直接粘贴。' });
    window.setTimeout(() => setDidCopy(false), 1800);
  }

  return (
    <main className={`appShell mobile-${mobileView}`}>
      <header className="appHeader">
        <div className="brandLockup">
          <span className="brandIcon"><BookOpen size={21} /></span>
          <div>
            <h1>Kindle Flomo Cards</h1>
            <p>本地阅读摘录工作台</p>
          </div>
        </div>

        <div className="headerActions">
          <button className="actionButton secondary" onClick={syncKindle} disabled={isSyncing}>
            <RefreshCw className={isSyncing ? 'spin' : ''} size={17} />
            {isSyncing ? '正在同步' : '同步 Kindle'}
          </button>
          <button className="actionButton primary" onClick={() => fileRef.current?.click()}>
            <FileUp size={17} />
            导入文件
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importFile(file);
              event.currentTarget.value = '';
            }}
          />
          <details className="importMore">
            <summary>粘贴导入</summary>
            <div className="importPopover">
              <label htmlFor="paste-clippings">My Clippings.txt 内容</label>
              <textarea
                id="paste-clippings"
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="粘贴 Kindle 摘录文本"
              />
              <button
                className="actionButton primary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  importParsed(parseKindleClippings(pasteText), new Date().toISOString(), '粘贴内容');
                  setPasteText('');
                }}
              >
                <Upload size={16} />
                解析内容
              </button>
            </div>
          </details>
        </div>
      </header>

      <section className={`statusStrip ${status.tone}`} aria-live="polite">
        <div className="statusMessage">
          {status.tone === 'success' ? <Check size={16} /> : <RefreshCw className={status.tone === 'working' ? 'spin' : ''} size={16} />}
          <span>{status.text}</span>
        </div>
        <div className="libraryStats" aria-label="摘录统计">
          <span><strong>{memos.length}</strong> 条摘录</span>
          <span><strong>{books}</strong> 本书</span>
          <span><strong>{tags.length}</strong> 个标签</span>
        </div>
      </section>

      <div className="workspace">
        <section className="libraryPane" aria-label="摘录库">
          <div className="paneHeading">
            <div>
              <p>阅读摘录</p>
              <h2>{filtered.length === memos.length ? `${memos.length} 条内容` : `${filtered.length} 条结果`}</h2>
            </div>
            <button className="quietButton" onClick={exportBatch} disabled={filtered.length === 0 || isExporting}>
              <Download size={16} />
              批量导出
            </button>
          </div>

          <div className="searchField">
            <Search size={18} />
            <input
              aria-label="搜索摘录"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索摘录、评论、书名或标签"
            />
          </div>

          <div className="filterRow" aria-label="摘录筛选">
            {([
              ['all', '全部'],
              ['recent', '最近导入'],
              ['untagged', '未整理'],
            ] as [FilterMode, string][]).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filterMode === value}
                className={filterMode === value ? 'active' : ''}
                onClick={() => setFilterMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {tags.length > 0 && (
            <div className="tagScroller" aria-label="按标签筛选">
              <button className={!activeTag ? 'active' : ''} onClick={() => setActiveTag('')}>
                <Tags size={14} /> 全部标签
              </button>
              {tags.map(([tag, count]) => (
                <button key={tag} className={activeTag === tag ? 'active' : ''} onClick={() => setActiveTag(tag)}>
                  #{tag} <span>{count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="memoList">
            {filtered.map((memo) => (
              <article key={memo.id} className={selectedMemo?.id === memo.id ? 'memoItem selected' : 'memoItem'}>
                <button className="memoSelect" onClick={() => setSelectedId(memo.id)}>
                  <span className="memoMeta">
                    <strong>{memo.title}</strong>
                    <small>{formatLocation(memo)}</small>
                  </span>
                  <span className="memoQuote">{memo.quote || memo.comment}</span>
                  {memo.comment && memo.quote && <span className="memoComment">{memo.comment}</span>}
                  <span className="memoTags">
                    {memo.tags.length ? memo.tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>未整理</span>}
                  </span>
                </button>
                <button
                  className="buildButton"
                  onClick={() => {
                    setSelectedId(memo.id);
                    setMobileView('studio');
                  }}
                >
                  制作卡片
                </button>
              </article>
            ))}
            {filtered.length === 0 && (
              <div className="emptyState">
                <span><Library size={24} /></span>
                <h3>{memos.length ? '没有匹配的摘录' : '从 Kindle 带回第一条摘录'}</h3>
                <p>{memos.length ? '试试清除搜索词或切换筛选。' : '连接 Kindle 同步，或导入 My Clippings.txt。'}</p>
                {!memos.length && (
                  <button className="actionButton primary" onClick={() => fileRef.current?.click()}>
                    <FileUp size={16} /> 导入文件
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="studioPane" aria-label="卡片工作台">
          <div className="studioHeading">
            <div>
              <p>卡片工作台</p>
              <h2>{selectedMemo ? compactTitle(selectedMemo.title) : '等待摘录'}</h2>
            </div>
            <span>{sizePresets[size].width} × {getCardDimensions(size, template, selectedMemo?.quote || '', selectedMemo?.comment || '').height}</span>
          </div>

          <div className="controlDeck">
            <fieldset>
              <legend>内容</legend>
              <div className="segmented">
                {(['quote', 'comment', 'memo'] as Template[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={template === item}
                    className={template === item ? 'active' : ''}
                    onClick={() => { setTemplate(item); persistSettings({ template: item }); }}
                  >
                    {item === 'quote' ? '金句' : item === 'comment' ? '评论' : 'Memo'}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>主题</legend>
              <div className="segmented iconSegmented">
                {(['paper', 'light', 'dark'] as Theme[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-label={item === 'paper' ? '纸张主题' : item === 'light' ? '浅色主题' : '深色主题'}
                    aria-pressed={theme === item}
                    className={theme === item ? 'active' : ''}
                    onClick={() => { setTheme(item); persistSettings({ theme: item }); }}
                  >
                    {item === 'dark' ? <Moon size={15} /> : item === 'light' ? <Sun size={15} /> : <Sparkles size={15} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="sizeField">
              <span>尺寸</span>
              <select value={size} onChange={(event) => { const next = event.target.value as SizePreset; setSize(next); persistSettings({ size: next }); }}>
                {Object.entries(sizePresets).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select>
            </label>
          </div>

          {selectedMemo ? (
            <>
              <CardPreview
                ref={cardRef}
                memo={selectedMemo}
                template={template}
                theme={theme}
                size={size}
                memoCount={memos.length}
                bookCount={books}
                memos={memos}
              />
              <section className="editorPanel">
                <div className="editorHeading">
                  <h3>整理内容</h3>
                  <span>自动保存在本机</span>
                </div>
                <label>
                  <span>摘录</span>
                  <textarea value={selectedMemo.quote} onChange={(event) => updateMemo(selectedMemo.id, { quote: event.target.value })} />
                </label>
                <label>
                  <span>评论</span>
                  <textarea
                    value={selectedMemo.comment}
                    placeholder="写下这句话为什么值得保留"
                    onChange={(event) => updateMemo(selectedMemo.id, { comment: event.target.value })}
                  />
                </label>
                <label>
                  <span>标签</span>
                  <input
                    value={selectedMemo.tags.map((tag) => `#${tag}`).join(' ')}
                    placeholder="#写作 #心理学"
                    onChange={(event) => {
                      const nextTags = Array.from(event.target.value.matchAll(/#([\p{L}\p{N}_\-\u4e00-\u9fa5]+)/gu)).map((match) => match[1]);
                      updateMemo(selectedMemo.id, { tags: [...new Set(nextTags)] });
                    }}
                  />
                </label>
                <div className="studioActions">
                  <button className="actionButton secondary" onClick={copyForFlomo}>
                    {didCopy ? <Check size={17} /> : <Copy size={17} />}
                    {didCopy ? '已复制' : '复制为 flomo'}
                  </button>
                  <button className="actionButton primary" onClick={() => exportCard()} disabled={isExporting}>
                    <ImageDown size={17} />
                    {isExporting ? '正在导出' : '导出 PNG'}
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="emptyState previewEmpty">
              <span><Hash size={24} /></span>
              <h3>还没有可预览的内容</h3>
              <p>导入摘录后，可以在这里编辑并导出分享卡片。</p>
            </div>
          )}
        </aside>
      </div>

      <nav className="mobileSwitcher" aria-label="移动端工作区切换">
        <button className={mobileView === 'library' ? 'active' : ''} onClick={() => setMobileView('library')}>
          <Library size={17} /> 摘录
        </button>
        <button className={mobileView === 'studio' ? 'active' : ''} onClick={() => setMobileView('studio')} disabled={!selectedMemo}>
          <Sparkles size={17} /> 卡片
        </button>
      </nav>
    </main>
  );
}

const CardPreview = React.forwardRef<HTMLDivElement, {
  memo: Memo;
  template: Template;
  theme: Theme;
  size: SizePreset;
  memoCount: number;
  bookCount: number;
  memos: Memo[];
}>(
  ({ memo, template, theme, size, memoCount, bookCount, memos }, ref) => {
    const location = formatLocation(memo);
    const quote = (memo.quote || memo.comment || '').trim();
    const memoDate = parseMemoDate(memo);
    const date = formatCardDate(memoDate?.toISOString() || memo.importedAt);
    const source = [compactTitle(memo.title), memo.author, location].filter(Boolean).join(' / ');
    const quoteScale = size === 'flomo' ? 'fixedText' : getQuoteScale(quote);
    const dimensions = getCardDimensions(size, template, quote, memo.comment || '');
    const availablePreviewWidth = Math.max(280, Math.min(420, window.innerWidth - 48));
    const previewScale = Math.min(1, availablePreviewWidth / (size === 'flomo' ? sizePresets.flomo.width : dimensions.width));
    const heatmap = buildReadingHeatmap(memos, size === 'flomo' ? 18 : 26);

    return (
      <div className="previewStage" style={{ height: Math.ceil(dimensions.height * previewScale) + 2 }}>
        <div
          ref={ref}
          className={`shareCard ${theme} ${template} ${size} ${quoteScale}`}
          style={{ width: dimensions.width, height: dimensions.height, transform: `scale(${previewScale})` }}
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
            {(template === 'comment' && memo.comment && memo.quote) && <p className="commentText">{memo.comment}</p>}
            {template === 'memo' && (
              <div className="cardTags">
                {memo.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            )}
          </div>

          <div className="cardMetaRow">
            <strong>{memoCount} MEMOS · {bookCount} BOOKS</strong>
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

function ReadingHeatmap({ heatmap }: ReturnType<typeof buildReadingHeatmap> extends infer T ? { heatmap: T } : never) {
  const activeDays = heatmap.cells.filter((cell) => cell.count > 0).length;
  return (
    <div className="readingHeatmap" aria-label={`近期开启阅读的天数：${activeDays}`}>
      <span className="srOnly">近期开启阅读的天数：{activeDays}</span>
      <div aria-hidden="true">
      <div className="heatmapMonths" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${heatmap.weekCount}, 1fr)` }}>
        {heatmap.months.map((month, index) => <span key={`${month}-${index}`}>{month}</span>)}
      </div>
      <div className="heatmapBody">
        <div className="heatmapWeekdays" aria-hidden="true">
          <span />
          <span>Mon</span>
          <span />
          <span>Wed</span>
          <span />
          <span>Fri</span>
          <span />
        </div>
        <div className="heatmapCells" style={{ gridTemplateColumns: `repeat(${heatmap.weekCount}, 1fr)` }}>
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

createRoot(document.getElementById('root')!).render(<App />);
