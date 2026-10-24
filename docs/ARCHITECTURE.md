# Architecture

Kindle Cards 采用本地优先的单机架构。浏览器界面通过本地 Node.js 服务读取 Kindle，并管理截图和完整备份。

```text
USB Kindle (drive letter or Windows MTP/WPD)
   |
   | My Clippings.txt / temporary read-only snapshot
   v
Local Express API -> content revision -> Kindle parser -> React workspace -> localStorage
                                              |
                                              +-> clipboard text
                                              +-> PNG / ZIP download
```

## Boundaries

### Browser application

- `src/App.tsx` 负责主要工作流和状态协调。
- 页面可见时每 5 秒查询一次 Kindle；携带上次内容指纹，未变化时不重复传输或合并摘录。
- `src/components/` 负责可独立维护的界面组件与全局错误状态。
- `src/lib/cardUtils.ts` 负责无副作用的卡片尺寸、日期和阅读热力图计算。
- `src/lib/storage.ts` 负责本地数据校验、设置校验和持久化失败提示。
- 摘录以带格式版本和存储版本的单个数据封装写入；多个窗口通过 `storage` 事件刷新，旧版本写入会被拒绝并提示用户。
- `src/lib/kindleParser.js` 负责将 Kindle 文本转换为 memo，并在重复导入时合并记录。
- `src/lib/memoFormat.js` 负责生成可粘贴到笔记应用的纯文本。

### Local service

- `server.mjs` 只监听 `127.0.0.1`。
- `/api/health` 提供版本和构建指纹，用于启动器识别旧服务。
- `/api/kindle-clippings` 查找并读取 Kindle 摘录；Windows 下先检查盘符，再检查 MTP/WPD 便携设备。
- 响应包含内容 SHA-256 指纹；请求携带相同 `revision` 时只返回 `changed: false`，不重复返回摘录。
- MTP/WPD 文件由 `scripts/read-kindle-mtp.ps1` 通过 Windows Shell 复制到唯一临时目录，读取后立即清理，不返回设备路径。
- 生产模式提供 Vite 构建后的静态文件，开发模式挂载 Vite 中间件。
- `/api/screenshots` 提供截图扫描、导入、编辑、原图读取和 Windows OCR。
- `POST /api/kindle-covers/scan` 读取可访问的 EPUB/MOBI/AZW/AZW3 内嵌封面，以及 KFX 元数据明确引用的未受保护图片。`bookCover.mjs` 负责格式解析及原始摘录头/作者匹配，`kfxCover.mjs` 使用 ion-js 有界解码容器元数据，`kindleCovers.mjs` 负责只读扫描与 HTTP；Windows MTP 使用 `scripts/scan-kindle-books.ps1` 生成临时副本。不解密受保护资源，系统缩略图缓存的通用关联不在当前范围。
- 书架页面可见时，有待处理书籍便继续分批扫描，空闲每分钟检查，支持手动重试。MTP 优先筛选缺封面书籍对应的文件，再读取大小等属性；按文件指纹避免重复复制，单批最多 8 本、单本 64 MB。封面复用 `storeMedia` 的 5 MB 上限与内容寻址。手动封面不会被异步扫描结果覆盖。
- `/api/backup/export` 生成完整 ZIP；`/api/backup/restore` 在校验格式、大小和 SHA-256 后增量恢复截图，并把摘录与设置交给浏览器合并。
- 备份媒体集合来自当前设置、书籍封面和归档内每个截图编辑版本，排除无引用图片，但不清理本地文件；引用图片无法读取时导出失败，避免静默缺图。保留 v1/v2 读取和 256 MiB 压缩包上限。

### Windows launcher

`launch.ps1` 验证 Node.js、锁定依赖、构建生产文件并启动后台服务。构建指纹由 `dist/index.html` 和 `server.mjs` 的哈希组成。

## Data compatibility

浏览器数据继续使用以下稳定键名：

- `kindle-cards:memos`
- `kindle-cards:settings`

读取时会逐条校验 memo。无效记录会被跳过并显示提示，但原始本地存储不会在读取失败时被覆盖。旧版数组格式可直接读取，在下一次成功保存时迁移为版本化数据封装。

完整备份使用 `kindle-cards-backup` 格式。`manifest.json` 记录格式版本和每个文件的 SHA-256；截图目录保留内容寻址原图及所有递增 JSON 编辑版本。恢复不会替换已有同编号资料。

## Testing layers

- 解析器和格式器：Node.js 内置测试运行器
- 本地 API：真实 HTTP 端口的集成测试
- 存储和核心界面：Vitest、jsdom、Testing Library
- 交付门禁：ESLint、TypeScript、测试、Vite 构建、Prettier、npm audit
