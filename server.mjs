import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKindleClippings } from './src/lib/kindleParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const portArgument = process.argv.find((argument) => argument.startsWith('--port='));
const port = Number(portArgument?.split('=')[1] || process.env.PORT || 4310);
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'kindle-flomo-cards' });
});

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findKindleClippings() {
  const candidates = [];

  if (process.platform === 'win32') {
    for (let code = 67; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      candidates.push(path.join(drive, 'documents', 'My Clippings.txt'));
      candidates.push(path.join(drive, 'Documents', 'My Clippings.txt'));
    }
  } else {
    const home = process.env.HOME || '';
    candidates.push(
      '/Volumes/Kindle/documents/My Clippings.txt',
      '/media/Kindle/documents/My Clippings.txt',
      path.join(home, 'Kindle', 'documents', 'My Clippings.txt'),
    );
  }

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  return null;
}

app.get('/api/kindle-clippings', async (_req, res) => {
  try {
    const filePath = await findKindleClippings();
    if (!filePath) {
      res.status(404).json({
        ok: false,
        message: '没有自动找到 Kindle。请确认已通过 USB 连接，或用“导入文件”选择 My Clippings.txt。',
      });
      return;
    }

    const text = await fs.readFile(filePath, 'utf8');
    res.json({
      ok: true,
      source: filePath,
      importedAt: new Date().toISOString(),
      memos: parseKindleClippings(text),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '读取 Kindle 摘录失败。',
    });
  }
});

if (isProduction) {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.use((_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Kindle Flomo Cards running at http://127.0.0.1:${port}`);
});

server.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

globalThis.__kindleMemoCardsServer = server;
