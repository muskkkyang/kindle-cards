# Kindle Flomo Cards

[English](./README.en.md)

[![CI](https://github.com/muskkkyang/kindle-flomo-cards/actions/workflows/ci.yml/badge.svg)](https://github.com/muskkkyang/kindle-flomo-cards/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/muskkkyang/kindle-flomo-cards)](https://github.com/muskkkyang/kindle-flomo-cards/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f62.svg)](./LICENSE)

一个本地优先的 Kindle 摘录工作台。它把 `My Clippings.txt` 解析成可搜索、可编辑的阅读 memo，并导出适合 flomo、朋友圈、小红书和公众号的分享卡片。

| 摘录库                                            | 卡片工作台                                                   |
| ------------------------------------------------- | ------------------------------------------------------------ |
| ![移动端摘录库](./docs/images/mobile-library.png) | ![移动端卡片工作台](./docs/images/mobile-card-workspace.png) |

## 为什么做这个工具

Kindle 摘录适合阅读时快速记录，但后续整理和分享通常很割裂。Kindle Flomo Cards 把流程收敛为一条本地链路：

```text
Kindle / My Clippings.txt -> 本地解析与整理 -> flomo 文本或 PNG 卡片
```

不需要账号、云服务或 API 密钥。阅读数据默认只保存在当前浏览器的本地存储中。

## 主要能力

- 自动识别通过 USB 连接的 Kindle，也可导入或粘贴 `My Clippings.txt`。
- 解析中英文书名、作者、页码、位置、摘录、笔记和 `#标签`。
- 识别连续修改的 Kindle 笔记，保留内容更完整的版本。
- 重复同步时更新已有记录，避免生成重复草稿。
- 本地搜索、筛选、编辑与自动保存。
- 一键复制为 flomo memo 格式。
- 导出金句卡、评论卡和阅读 memo 卡。
- 支持 Flomo 横卡、1:1、3:4 和公众号横图尺寸。
- 批量导出为单个 ZIP 文件，避免浏览器连续下载提示。
- 支持系统深浅色、键盘焦点、减少动态效果和窄屏工作区切换。

## 快速开始

需要 [Node.js 22.22.2 或更高版本](https://nodejs.org/)。

```powershell
git clone https://github.com/muskkkyang/kindle-flomo-cards.git
cd kindle-flomo-cards
npm ci
npm run dev
```

打开 `http://127.0.0.1:4310`。

你也可以先导入仓库中的 `sample-clippings.txt`，不用连接 Kindle 即可体验完整流程。

## Windows 桌面使用

一键启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\launch.ps1
```

启动器会检查 Node.js 版本、安装依赖、按需构建，并从 `4310-4319` 中选择可用端口。它使用构建指纹识别旧服务，避免打开过期界面。

创建桌面快捷方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\create-desktop-shortcut.ps1
```

已有同名快捷方式时脚本不会覆盖。确认要更新快捷方式目标后，可添加 `-Force`。

## Kindle 笔记格式

在 Kindle 笔记里直接写评论和标签：

```text
#写作 #心理学 这句话适合放进文章开头。
```

同步后会得到：

- 摘录：Kindle 划线原文
- 评论：去除标签后的笔记正文
- 标签：`写作`、`心理学`

## 隐私与安全

- 页面和本地 API 只监听 `127.0.0.1`。
- 摘录、评论和标签保存在浏览器本地存储。
- 服务只读取已连接 Kindle 中的 `My Clippings.txt`。
- API 不向页面暴露本机完整文件路径。
- “复制为 flomo”只写入本机剪贴板，不会自动发送到 flomo。
- 项目不包含分析脚本、遥测、广告或云端上传逻辑。

浏览器本地数据并不等于备份。重要摘录仍应保留原始 `My Clippings.txt` 或其他独立备份。

## 开发与质量检查

```powershell
npm ci
npm run check
```

`npm run check` 会依次执行 ESLint、TypeScript、单元与界面测试、生产构建和格式检查。

常用命令：

| 命令                | 用途                             |
| ------------------- | -------------------------------- |
| `npm run dev`       | 启动本地开发服务                 |
| `npm run test`      | 运行解析器、服务、存储与界面测试 |
| `npm run lint`      | 检查代码规范                     |
| `npm run typecheck` | 检查 TypeScript 类型             |
| `npm run build`     | 生成生产文件                     |
| `npm run format`    | 统一代码与文档格式               |

架构说明见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 参与贡献

问题反馈和改进建议欢迎通过 [GitHub Issues](https://github.com/muskkkyang/kindle-flomo-cards/issues) 提交。开始编码前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)，安全问题请按 [SECURITY.md](./SECURITY.md) 私下报告。

## 许可证

[MIT](./LICENSE)
