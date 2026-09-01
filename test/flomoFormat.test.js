import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFlomoMemo } from '../src/lib/flomoFormat.js';

test('formats a Kindle memo for direct paste into flomo', () => {
  const text = formatFlomoMemo({
    quote: '一句值得保留的话。',
    comment: '这是我的评论。',
    title: '中文书名',
    author: '作者甲',
    tags: ['写作', '心理学'],
  });

  assert.equal(text, '一句值得保留的话。\n\n这是我的评论。\n\n《中文书名》 作者甲\n\n#写作 #心理学');
});
