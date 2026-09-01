# Kindle Flomo Cards

把 Kindle 离线摘录整理成 flomo 风格分享卡片的 Windows 本地工具。

## 当前能力

- 自动识别通过 USB 连接的 Kindle，也可手动导入 `My Clippings.txt`。
- 解析中英文书名、作者、位置、时间、摘录、连续修改的评论和笔记中的 `#标签`。
- 重复同步时自动更新已修改的笔记，不产生重复草稿。
- 在本地搜索、筛选、编辑和自动保存摘录，展示阅读活跃度。
- 提供金句卡、评论卡、阅读 memo 卡，以及多种主题和常用社交媒体尺寸。
- 一键复制为 flomo memo 格式，可直接粘贴到 flomo。
- 将当前卡片导出为 PNG，不依赖云端服务。
- 支持桌面与移动宽度，窄屏可在“摘录”和“卡片”工作区间切换。

## 项目状态

当前是可在 Windows 本地使用的个人 MVP。核心流程是：

```text
Kindle / My Clippings.txt → 本地解析与整理 → 卡片预览 → 复制到 flomo 或导出 PNG
```

## 使用方式

1. 在 Kindle Paperwhite 上保持飞行模式阅读，正常划线。
2. 如需分类和评论，在 Kindle 笔记里写：`#写作 #心理学 这句话适合放进文章开头。`
3. 用 USB 连接 Kindle 到 Windows 电脑。
4. 启动本工具后点击“同步 Kindle”。
5. 选择摘录，调整模板、主题和尺寸，点击“导出当前卡片”。

如果没有自动找到 Kindle，可以点击“导入文件”，手动选择 Kindle 里的 `documents/My Clippings.txt`。

## 本地开发

```powershell
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:4310
```

完整检查：

```powershell
npm run check
```

## 桌面启动

Windows 桌面快捷方式会调用项目里的 `launch.ps1`：

- 如果依赖不存在，会先安装依赖。
- 如果生产文件不存在，会先构建。
- 如果本地服务未运行，会在后台启动。
- 默认从 `http://127.0.0.1:4310` 开始寻找可用端口并自动打开。
- 源码或配置比生产文件更新时，会自动重新构建，避免打开旧版本。

也可以手动运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\launch.ps1
```

重新创建桌面快捷方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\create-desktop-shortcut.ps1
```

## 数据说明

- 摘录和标签保存在浏览器本地存储。
- 本地服务只读取 USB Kindle 里的 `My Clippings.txt`。
- “复制为 flomo”只写入本机剪贴板，不会自动向外发送内容。
- 不上传阅读数据，不需要云端账号或 API 密钥。

## 支持的卡片

- 金句卡
- 评论卡
- 阅读 memo 卡

默认导出尺寸：

- 朋友圈/通用：1080x1080
- 小红书：1080x1440
- 公众号横图：1200x675

## 主要文件

| 路径 | 用途 |
| --- | --- |
| `src/` | 卡片管理、预览与导出界面 |
| `server.mjs` | Kindle 文件发现、本地 API 与静态服务 |
| `launch.ps1` | Windows 一键构建、启动与打开页面 |
| `create-desktop-shortcut.ps1` | 创建桌面快捷方式 |

本仓库保持私有，用于代码与项目资料备份。
