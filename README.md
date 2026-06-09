# Kindle Memo Cards

Kindle 离线摘录到 flomo 风格分享卡片的本地工具。

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
http://127.0.0.1:5173
```

## 桌面启动

Windows 桌面快捷方式会调用项目里的 `launch.ps1`：

- 如果依赖不存在，会先安装依赖。
- 如果生产文件不存在，会先构建。
- 如果本地服务未运行，会在后台启动。
- 最后自动打开 `http://127.0.0.1:5173`。

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
- 不上传阅读数据。

## 支持的卡片

- 金句卡
- 评论卡
- 阅读 memo 卡

默认导出尺寸：

- 朋友圈/通用：1080x1080
- 小红书：1080x1440
- 公众号横图：1200x675
