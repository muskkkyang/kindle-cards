# Architecture

Kindle Flomo Cards 采用本地优先的单机架构，浏览器界面和本地 Node.js 服务之间只有两个只读 API。

```text
USB Kindle
   |
   | My Clippings.txt
   v
Local Express API -> Kindle parser -> React workspace -> localStorage
                                              |
                                              +-> clipboard text
                                              +-> PNG / ZIP download
```

## Boundaries

### Browser application

- `src/App.tsx` 负责主要工作流和状态协调。
- `src/components/` 负责可独立维护的界面组件与全局错误状态。
- `src/lib/cardUtils.ts` 负责无副作用的卡片尺寸、日期和阅读热力图计算。
- `src/lib/storage.ts` 负责本地数据校验、设置校验和持久化失败提示。
- `src/lib/kindleParser.js` 负责将 Kindle 文本转换为 memo，并在重复导入时合并记录。
- `src/lib/flomoFormat.js` 负责生成可直接粘贴到 flomo 的纯文本。

### Local service

- `server.mjs` 只监听 `127.0.0.1`。
- `/api/health` 提供版本和构建指纹，用于启动器识别旧服务。
- `/api/kindle-clippings` 查找并读取 Kindle 摘录，不返回本机完整路径。
- 生产模式提供 Vite 构建后的静态文件，开发模式挂载 Vite 中间件。

### Windows launcher

`launch.ps1` 验证 Node.js、锁定依赖、构建生产文件并启动后台服务。构建指纹由 `dist/index.html` 和 `server.mjs` 的哈希组成。

## Data compatibility

浏览器数据继续使用以下稳定键名：

- `kindle-flomo-cards:memos`
- `kindle-flomo-cards:settings`

读取时会逐条校验 memo。无效记录会被跳过并显示提示，但原始本地存储不会在读取失败时被覆盖。

## Testing layers

- 解析器和格式器：Node.js 内置测试运行器
- 本地 API：真实 HTTP 端口的集成测试
- 存储和核心界面：Vitest、jsdom、Testing Library
- 交付门禁：ESLint、TypeScript、测试、Vite 构建、Prettier、npm audit
