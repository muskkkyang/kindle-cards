# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 和 [Semantic Versioning](https://semver.org/)。

## [1.0.0] - 2026-09-02

### Added

- Kindle USB 自动发现、文本导入和粘贴导入。
- 中文与英文摘录、笔记、标签解析。
- 重复导入合并与连续笔记编辑识别。
- 本地搜索、筛选、编辑和持久化。
- flomo 文本复制和多尺寸卡片导出。
- ZIP 批量导出、响应式界面和深浅色支持。
- 数据校验、服务安全头、自动化测试和 GitHub CI。

### Changed

- 将单文件界面拆分为应用、卡片组件、存储和卡片计算模块。
- 启动器通过构建指纹识别当前服务，避免复用旧版本。

### Security

- 本地 API 不再返回完整设备文件路径。
- Kindle 文件读取增加 25 MB 大小限制。
