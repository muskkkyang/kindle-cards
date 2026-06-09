import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import {
  BookOpen,
  Download,
  FileUp,
  Hash,
  ImageDown,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Tags,
  Upload,
} from 'lucide-react';
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

const STORAGE_KEY = 'kindle-flomo-cards:memos';
const SETTINGS_KEY = 'kindle-flomo-cards:settings';
const memoryStore = new Map<string, string>();

const sizePresets: Record<SizePreset, { label: string; width: number; height: number }> = {
  flomo: { label: 'Flomo 横卡', width: 720, height: 498 },
  square: { label: '朋友圈 1:1', width: 1080, height: 1080 },
  portrait: { label: '小红书 3:4', width: 1080, height: 1440 },
  wide: { label: '公众号横图', width: 1200, height: 675 },
};

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

function compactTitle(title: string) {
  return title
    .replace(/（.*?）|\(.*?\)/g, '')
    .replace(/[—-]+.*$/g, '')
    .trim() || title;
}

function getRecentCutoff(memos: Memo[]) {
  return memos.reduce((max, memo) => Math.max(max, Date.parse(memo.importedAt || '') || 0), 0);
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
  const [status, setStatus] = useState('连接 Kindle 后点击同步，或直接导入 My Clippings.txt。');
  const [pasteText, setPasteText] = useState('');
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
    const result = mergeMemos(memos, parsed, importedAt);
    persist(result.memos);
    setFilterMode('recent');
    setActiveTag('');
    if (result.added > 0) setSelectedId(result.memos[result.memos.length - result.added]?.id || result.memos[0]?.id || '');
    setStatus(`${source} 已同步：新增 ${result.added} 条，当前共 ${result.memos.length} 条。`);
  }

  async function syncKindle() {
    setStatus('正在查找 Kindle 摘录文件...');
    try {
      const response = await fetch('/api/kindle-clippings');
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || '同步失败');
      importParsed(payload.memos, payload.importedAt, payload.source);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '没有找到 Kindle，请改用导入文件。');
    }
  }

  async function importFile(file: File) {
    const text = await file.text();
    importParsed(parseKindleClippings(text), new Date().toISOString(), file.name);
  }

  function updateMemo(id: string, changes: Partial<Memo>) {
    persist(memos.map((memo) => (memo.id === id ? { ...memo, ...changes } : memo)));
  }

  async function exportCard(memo = selectedMemo) {
    if (!cardRef.current || !memo) return;
    const preset = sizePresets[size];
    const previousTransform = cardRef.current.style.transform;
    cardRef.current.style.transform = 'none';
    let dataUrl = '';

    try {
      dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 1,
        width: preset.width,
        height: preset.height,
        style: {
          width: `${preset.width}px`,
          height: `${preset.height}px`,
        },
      });
    } finally {
      cardRef.current.style.transform = previousTransform;
    }

    const link = document.createElement('a');
    link.download = `${compactTitle(memo.title).slice(0, 24)}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  async function exportBatch() {
    for (const memo of filtered.slice(0, 20)) {
      setSelectedId(memo.id);
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      await exportCard(memo);
    }
    setStatus(`已导出 ${Math.min(filtered.length, 20)} 张卡片。`);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BookOpen size={24} />
          <div>
            <h1>Kindle Memo</h1>
            <p>离线摘录卡片工具</p>
          </div>
        </div>

        <button className="primaryAction" onClick={syncKindle}>
          <RefreshCw size={18} />
          同步 Kindle
        </button>
        <button className="secondaryAction" onClick={() => fileRef.current?.click()}>
          <FileUp size={18} />
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

        <details className="pasteBox">
          <summary>粘贴导入</summary>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="粘贴 My Clippings.txt 内容"
          />
          <button
            className="secondaryAction"
            onClick={() => {
              if (!pasteText.trim()) return;
              importParsed(parseKindleClippings(pasteText), new Date().toISOString(), '粘贴内容');
              setPasteText('');
            }}
          >
            <Upload size={17} />
            解析粘贴内容
          </button>
        </details>

        <div className="status">{status}</div>

        <section className="stats">
          <div><strong>{memos.length}</strong><span>摘录</span></div>
          <div><strong>{books}</strong><span>书籍</span></div>
          <div><strong>{tags.length}</strong><span>标签</span></div>
        </section>

        <nav className="navGroup">
          <button className={filterMode === 'all' ? 'active' : ''} onClick={() => setFilterMode('all')}>全部</button>
          <button className={filterMode === 'recent' ? 'active' : ''} onClick={() => setFilterMode('recent')}>最近导入</button>
          <button className={filterMode === 'untagged' ? 'active' : ''} onClick={() => setFilterMode('untagged')}>未整理</button>
        </nav>

        <section className="tagPanel">
          <div className="panelTitle"><Tags size={15} /> 标签</div>
          <button className={!activeTag ? 'tag active' : 'tag'} onClick={() => setActiveTag('')}>全部标签</button>
          {tags.map(([tag, count]) => (
            <button key={tag} className={activeTag === tag ? 'tag active' : 'tag'} onClick={() => setActiveTag(tag)}>
              <span>#{tag}</span><em>{count}</em>
            </button>
          ))}
        </section>
      </aside>

      <section className="memoPane">
        <div className="toolbar">
          <div className="searchBox">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索摘录、评论、书名、标签" />
          </div>
          <button className="iconText" onClick={exportBatch}><Download size={17} /> 批量导出</button>
        </div>

        <div className="memoList">
          {filtered.map((memo) => (
            <article
              key={memo.id}
              className={selectedMemo?.id === memo.id ? 'memoItem selected' : 'memoItem'}
              onClick={() => setSelectedId(memo.id)}
            >
              <div className="memoMeta">
                <span>{memo.title}</span>
                <small>{formatLocation(memo)}</small>
              </div>
              <p>{memo.quote || memo.comment}</p>
              {memo.comment && <blockquote>{memo.comment}</blockquote>}
              <div className="memoFooter">
                <div className="inlineTags">
                  {memo.tags.length ? memo.tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>未整理</span>}
                </div>
                <button onClick={(event) => { event.stopPropagation(); setSelectedId(memo.id); exportCard(memo); }}>
                  <ImageDown size={15} /> 生成卡片
                </button>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="empty">
              <Upload size={28} />
              <p>还没有匹配的摘录。连接 Kindle 同步，或导入 My Clippings.txt。</p>
            </div>
          )}
        </div>
      </section>

      <aside className="cardPane">
        <div className="controls">
          <div className="segmented">
            {(['quote', 'comment', 'memo'] as Template[]).map((item) => (
              <button
                key={item}
                className={template === item ? 'active' : ''}
                onClick={() => { setTemplate(item); persistSettings({ template: item }); }}
              >
                {item === 'quote' ? '金句' : item === 'comment' ? '评论' : 'Memo'}
              </button>
            ))}
          </div>
          <div className="segmented">
            {(['paper', 'light', 'dark'] as Theme[]).map((item) => (
              <button
                key={item}
                className={theme === item ? 'active' : ''}
                onClick={() => { setTheme(item); persistSettings({ theme: item }); }}
                title={item}
              >
                {item === 'dark' ? <Moon size={15} /> : item === 'light' ? <Sun size={15} /> : <Sparkles size={15} />}
              </button>
            ))}
          </div>
          <select value={size} onChange={(event) => { const next = event.target.value as SizePreset; setSize(next); persistSettings({ size: next }); }}>
            {Object.entries(sizePresets).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
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
            />
            <div className="editor">
              <label>
                评论
                <textarea value={selectedMemo.comment} onChange={(event) => updateMemo(selectedMemo.id, { comment: event.target.value })} />
              </label>
              <label>
                标签
                <input
                  value={selectedMemo.tags.map((tag) => `#${tag}`).join(' ')}
                  onChange={(event) => {
                    const nextTags = Array.from(event.target.value.matchAll(/#([\p{L}\p{N}_\-\u4e00-\u9fa5]+)/gu)).map((match) => match[1]);
                    updateMemo(selectedMemo.id, { tags: [...new Set(nextTags)] });
                  }}
                />
              </label>
              <button className="primaryAction" onClick={() => exportCard()}>
                <ImageDown size={18} />
                导出当前卡片
              </button>
            </div>
          </>
        ) : (
          <div className="empty previewEmpty"><Hash size={30} /><p>导入摘录后，这里会出现分享卡片预览。</p></div>
        )}
      </aside>
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
}>(
  ({ memo, template, theme, size, memoCount, bookCount }, ref) => {
    const preset = sizePresets[size];
    const location = formatLocation(memo);
    const quote = (memo.quote || memo.comment || '').trim();
    const date = formatCardDate(memo.importedAt);
    const primaryTag = memo.tags[0] || '书摘随记';
    const source = [compactTitle(memo.title), memo.author, location].filter(Boolean).join(' · ');
    const quoteScale = getQuoteScale(quote);

    return (
      <div className="previewStage">
        <div
          ref={ref}
          className={`shareCard ${theme} ${template} ${size} ${quoteScale}`}
          style={{ width: preset.width, height: preset.height, transform: `scale(${Math.min(1, 420 / preset.width)})` }}
        >
          <div className="cardHeader">
            <div className="quoteMark">“</div>
            <div className="cardIdentity">
              <strong>Muskkk</strong>
              <span>{date}</span>
            </div>
          </div>

          <div className="cardMain">
            <p className="quoteText">{quote}</p>
            <div className="tagPill">#{primaryTag}</div>
            {(template === 'comment' && memo.comment && memo.quote) && <p className="commentText">{memo.comment}</p>}
            {template === 'memo' && (
              <div className="cardTags">
                {memo.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            )}
          </div>

          <div className="cardMetaRow">
            <strong>{memoCount} MEMOS · {bookCount} BOOKS</strong>
            <div className="dotMatrix" aria-hidden="true">
              {Array.from({ length: 48 }).map((_, index) => <span key={index} />)}
            </div>
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

createRoot(document.getElementById('root')!).render(<App />);
