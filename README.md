<div align="center">
  <img src="./assets/kindle-cards-icon.png" width="88" alt="Kindle Cards 图标">
  <h1>Kindle Cards</h1>
  <p><strong>把 Kindle 摘录变成可以整理、检索和分享的阅读资产。</strong></p>
  <p>本地优先 · 无需账号 · Windows 便携运行</p>
  <p>
    <a href="https://github.com/muskkkyang/kindle-cards/releases/latest">下载 Windows 便携版</a>
    · <a href="./CHANGELOG.md">查看更新</a>
    · <a href="./README.en.md">English</a>
  </p>
  <p>
    <a href="https://github.com/muskkkyang/kindle-cards/actions/workflows/ci.yml"><img src="https://github.com/muskkkyang/kindle-cards/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/muskkkyang/kindle-cards/releases/latest"><img src="https://img.shields.io/github/v/release/muskkkyang/kindle-cards" alt="Release"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-8a5a44.svg" alt="MIT License"></a>
  </p>
</div>

![Kindle Cards 书架首页（示例资料）](./docs/images/20261024-shelf-desktop.png)

Kindle Cards 把分散的 Kindle 划线、笔记和截图收进一条清晰的本地工作流。连接设备或导入文件后，你可以搜索、校对、补充评论与标签，再将内容输出为纯文本、PNG 卡片或批量 ZIP。

> 阅读数据留在自己的电脑里。应用不要求登录，不依赖云服务，也不包含遥测、广告或自动上传逻辑。

## v1.4.0 正式版

[下载 Windows x64 便携包](https://github.com/muskkkyang/kindle-cards/releases/download/v1.4.0/kindle-cards-1.4.0-windows-x64.zip) · [发布说明与 SHA-256 校验文件](https://github.com/muskkkyang/kindle-cards/releases/tag/v1.4.0)

打开应用先进入“我的书架”，可按书名、作者搜索，在网格和列表间切换，再从一本书进入对应摘录与卡片创作。“全部摘录”和“截图”保留独立入口。当前书架展示已导入摘录中的书籍，并非设备全部藏书清单。

本版修复了截图缩略图裁切、紧凑书架封面压缩、手机及横屏小票卡的留白选择，以及备份打包无引用旧图片的问题。封面按原比例完整显示，书名与作者分开呈现。

## 从划线到卡片

| 01 · 带回阅读痕迹                                                                 | 02 · 整理成自己的内容                                          | 03 · 输出与分享                                           |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| 自动识别盘符或 Windows MTP/WPD 连接的 Kindle，也可导入、粘贴 `My Clippings.txt`。 | 搜索书名、正文、评论和标签；自动合并重复同步，并保留本地修改。 | 复制通用笔记文本，或导出金句、评论、Memo 卡片与批量 ZIP。 |

页面打开时，应用每 5 秒检查一次 Kindle 连接与内容版本。只有 `My Clippings.txt` 发生变化时才执行增量合并，避免重复草稿和无意义传输。

书架支持自动补齐 Kindle 封面：读取设备中可访问的 EPUB、MOBI、AZW、AZW3 及未受保护 KFX 引用的封面，也可点击“从 Kindle 补齐封面”。页面可见时自动分批处理，空闲时每分钟检查；保留已设置的封面，不猜配不明确的版本。封面保存在本机，拔出设备后仍可显示，并随完整备份保存。2026-10-23 已用 Windows MTP 真机验证 21 本书中的 19 本；其余无可读封面资源的书籍支持手动上传。详见[本轮验证与边界](docs/2026-10-23-cover-thumbnails-fix.md)，已包含于 v1.4.0 正式版。

## 为阅读后的思考而设计

| 阅读整理                                               | 卡片表达                                      |
| ------------------------------------------------------ | --------------------------------------------- |
| 解析中英文书名、作者、页码、位置、摘录、笔记与 `#标签` | 金句、评论、Memo 与含封面的书页模板           |
| 识别连续修改的 Kindle 笔记，保留更完整的版本           | 纸张、浅色、深色、小票四种主题                |
| 本地搜索、标签筛选、编辑与自动保存                     | 阅读横卡、1:1、3:4、公众号横图、手机全屏 9:16 |
| 截图按内容去重，编辑保留历史版本                       | PNG 单张导出与 ZIP 批量导出                   |

### 移动端也能完整整理

| 摘录库                                                                      | 手机全屏小票卡                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| <img src="./docs/images/mobile-library.png" width="390" alt="移动端摘录库"> | <img src="./docs/images/mobile-receipt-card.png" width="390" alt="手机全屏小票主题卡片"> |

窄屏下，摘录库和卡片创作切换为两个独立视图，底部操作不会遮挡正文。手机全屏卡固定输出为 `1080 × 1920`，适合直接保存或发布到移动端内容平台。

### Kindle 截图也能进入同一套工作流

应用可以发现 Kindle 根目录及 `screenshots`、`documents/screenshots` 中的 PNG/JPEG 图片，也支持手动导入本地截图。

- 横图、竖图在缩略框中完整显示；原图保留，裁切和批注采用非破坏式编辑。
- Windows OCR 使用系统已经安装的识别语言；识别结果可校对、复制或加入卡片。
- 截图原图和递增编辑版本保存在 `data/screenshots/`，可通过 `KINDLE_CARDS_DATA_DIR` 指定新目录。
- 每张手动导入的图片不超过 20 MB；OCR 始终读取完整原图。

## 快速开始

### Windows 便携版

1. 从 [Releases](https://github.com/muskkkyang/kindle-cards/releases/latest) 下载 `kindle-cards-*-windows-x64.zip`。
2. 解压到希望长期保存的位置。
3. 双击 `Kindle Cards.cmd`。

便携包已包含运行时和生产依赖，不需要另外安装 Node.js、Git 或 npm。首次体验可以导入仓库中的 [`sample-clippings.txt`](./sample-clippings.txt)，无需连接 Kindle。

### 从旧版升级

1. 在旧版“备份与恢复”中点击“导出完整备份”，并保留原安装目录。
2. 将新版解压到独立目录后启动；若使用了新的浏览器或访问端口，在新版“备份与恢复”中恢复完整 ZIP。
3. 核对摘录、评论、标签、封面和截图后再处理旧版。不要把浏览器站点数据清理当作升级步骤。

### 从源码运行

需要 [Node.js 22.22.2 或更高版本](https://nodejs.org/)。

```powershell
git clone https://github.com/muskkkyang/kindle-cards.git
cd kindle-cards
npm ci
npm run dev
```

打开 `http://127.0.0.1:4310`。Windows 下也可以运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\launch.ps1
```

启动器会检查 Node.js、安装锁定依赖、按需构建，并从 `4310-4319` 选择可用端口。创建桌面快捷方式可运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\create-desktop-shortcut.ps1
```

已有同名快捷方式时脚本不会覆盖；明确需要更新目标时可添加 `-Force`。

## 在 Kindle 笔记中添加评论和标签

直接在一条 Kindle 笔记里输入：

```text
#写作 #心理学 这句话适合放进文章开头。
```

同步后，Kindle Cards 会整理为：

- **摘录**：Kindle 划线原文
- **评论**：去除标签后的笔记正文
- **标签**：`写作`、`心理学`

## 数据与隐私

| 数据                   | 默认位置                           | 说明                                               |
| ---------------------- | ---------------------------------- | -------------------------------------------------- |
| 摘录、评论、标签与设置 | 当前浏览器的 `localStorage`        | 不会自动上传；更换浏览器 origin 或端口不会自动迁移 |
| Kindle 截图与编辑历史  | 应用目录 `data/screenshots/`       | 原图与每次编辑分开保存                             |
| 封面与图片背景         | 应用目录 `data/screenshots/media/` | 图片留在本机，设置保存引用                         |
| MTP/WPD 临时快照       | 系统临时目录                       | 只读复制，解析完成后立即清理                       |

页面和本地 API 只监听 `127.0.0.1`。服务仅在用户发起导入或页面可见时读取 Kindle 的 `My Clippings.txt`、可发现截图与可访问的书籍封面资源，API 不向页面暴露完整设备路径。“复制笔记文本”只写入本机剪贴板。

侧栏或顶部的“备份与恢复”入口可以导出完整 ZIP 备份，内容包括摘录、本地修改、设置、截图原图、截图编辑历史，以及仍被设置或编辑历史引用的封面和背景。已被替换且不再被引用的旧媒体不会进入新备份；完整备份上限为 256 MB。恢复会先检查清单、文件大小和 SHA-256，只新增缺失资料；同编号差异保留当前版本。

浏览器本地存储本身不等于备份。升级或迁移电脑前，请导出完整备份，并继续保留 Kindle 原始的 `My Clippings.txt`。

## 开发与验证

```powershell
npm ci
npm run check
```

`npm run check` 依次执行 ESLint、TypeScript、单元测试、界面测试、生产构建与 Prettier 检查。

| 命令                           | 用途                                   |
| ------------------------------ | -------------------------------------- |
| `npm run dev`                  | 启动本地开发服务                       |
| `npm run test`                 | 运行解析器、服务、存储与界面测试       |
| `npm run typecheck`            | 检查 TypeScript 类型                   |
| `npm run build`                | 生成生产文件                           |
| `npm run package:portable:win` | 构建 Windows x64 便携包和 SHA-256 文件 |

更多信息见 [架构说明](./docs/ARCHITECTURE.md)、[V1.x 迭代与验收](./docs/V1.x-iterations.md)、[贡献指南](./CONTRIBUTING.md)与[安全策略](./SECURITY.md)。

## 当前范围

v1.4.0 已正式发布。独立书籍资料库、SQLite、阅读洞察和 AI 对话仍属[后续开发规划](./Kindle%20Cards%20后续开发项目计划书.md)，不包含在当前版中。封面补齐不绕过 DRM；没有可读封面时可手动上传。

发布验证包括 34 项 Node 测试、15 项界面与存储测试及 Windows 便携包检查。精确传输中拔出按用户要求豁免，未记为测试通过；详见[验收说明](./docs/V1.4-acceptance.md)。

## 许可证

[MIT](./LICENSE)
