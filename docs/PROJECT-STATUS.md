# Kindle Cards 项目成果与开发管理

更新日期：2026-10-21。此文档是成果索引与阶段状态快照，完整路线以根目录《Kindle Cards 后续开发项目计划书.md》为准；历史验收细节以 V1.x-iterations.md 为准。

## 2026-10-23 实测问题修复

用户实测发现封面未补齐、截图缩略图被横向裁切。已补 KFX 元数据和封面资源读取、修正 PowerShell 5 根数组处理及原始摘录头匹配；Windows MTP 真机与 Edge 自动补齐 19/21 本封面，另外 2 本没有可读取的封面资源。缩略图长文件名布局已修复并完成桌面、平板、手机回归。34 个 Node 与 14 个 UI 测试通过，审计 0 漏洞。详见[本轮修复与适配边界](2026-10-23-cover-thumbnails-fix.md)。以下 2026-10-22 的“未实机验证”是历史状态；本轮尚未推送或发布。

## 2026-10-22 收尾更新

本地完成 PR15 两项修复：receipt 手机/横屏留白选择生效；备份排除无引用媒体，同时保留全部截图编辑历史引用的背景。书架增加 Kindle 内嵌封面自动提取与匹配，保留已有手动封面，图片纳入本地备份。支持可读取的 EPUB、MOBI、AZW、AZW3；KFX、加密或无内嵌封面的书籍可手动上传。本轮尚未在真实 Kindle 上验证新增封面链路。

用户明确豁免确切传输中拔出的验收，该项不再阻塞 Phase 1；不记为测试通过。31 个 Node 与 14 个 UI/存储/尺寸测试通过，Edge 完成六组 receipt 留白与 PNG 导出、封面重载和 390px 布局验证。本地便携包已通过包内 Node 22.22.2、含空格路径启动、重复启动复用服务、图片/封面 API 与备份恢复验证。详见 [当前验收更新](V1.4-acceptance.md)。本地变更尚未推送、合并或发布，PR/Release/Projects 的远程状态未更新。后文为历史快照。

## 2026-10-21 开发进展

v1.4.0-rc.1 已落实第一阶段的书籍分组/封面、书页模板、Typography、留白/对齐与图片背景，同时修复真机 MTP 截图漏检和质量阻断。真机读取 372 条摘录、11 张唯一截图，重复扫描稳定，中文 OCR 可用。详见 [本轮验收](V1.4-acceptance.md)。

本候选版尚未关闭确切传输中拔出的硬件验收；Phase 2—4 继续保持规划状态。以下原始表格和检查结果为本轮开发前的状态快照，不应覆盖本节最新进展。

## 当前结论

当前已发布版本为 v1.3.0。Phase 1 核心同步与截图链路已实现，完整第一阶段尚未验收关闭。Phase 2—4 为规划，不代表已实现。依赖稳定性更新位于 Draft PR #13，CI quality 已通过，尚未合并至 main。

## 已有成果

| 成果                                | 位置                                                                 | 状态                             |
| ----------------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| 应用源码、Kindle 解析及本地服务     | src/、server.mjs                                                     | 已提交；当前工作基于 v1.3.0      |
| 自动同步及数据合并保护              | src/App.tsx、src/lib/kindleParser.js、src/lib/storage.ts             | 已实现，页面可见时轮询           |
| 截图库、裁切、OCR、截图卡片         | src/components/ScreenshotWorkspace.tsx、src/lib/、scripts/           | 核心链路已实现；真机边界仍待验收 |
| 摘录卡片、尺寸、主题与导出          | src/components/CardPreview.tsx、src/lib/cardUtils.ts                 | 已实现现有模板与尺寸             |
| 完整 ZIP 备份、恢复、多窗口冲突保护 | src/lib/backupArchive.mjs、src/lib/backupApi.mjs、src/lib/storage.ts | v1.3.0 已发布                    |
| 自动化测试与持续集成                | test/、.github/workflows/                                            | 已纳入版本管理                   |
| Windows 便携版与构建工具            | scripts/build-portable-win.ps1、GitHub Releases                      | v1.3.0 已发布                    |
| 产品定义、设计、架构和协作约定      | PRODUCT.md、DESIGN.md、docs/ARCHITECTURE.md、CONTRIBUTING.md         | 已纳入版本管理                   |
| 产品界面示例                        | docs/images/、README.md、README.en.md                                | 已纳入版本管理                   |
| 完整长期开发规划                    | 根目录《Kindle Cards 后续开发项目计划书.md》                         | 本次按用户要求纳入版本管理       |
| 历史迭代与验收证据                  | docs/V1.x-iterations.md、CHANGELOG.md                                | 区分已实现与待验证               |

源码：https://github.com/muskkkyang/kindle-cards

发布包：https://github.com/muskkkyang/kindle-cards/releases

项目看板（私有）：https://github.com/users/muskkkyang/projects/2

完整规划与成果归档 PR：https://github.com/muskkkyang/kindle-cards/pull/14

依赖更新：https://github.com/muskkkyang/kindle-cards/pull/13

## 开发阶段

| 阶段           | 目标                           | 当前状态                             | 退出条件                                                              |
| -------------- | ------------------------------ | ------------------------------------ | --------------------------------------------------------------------- |
| Phase 1 / V1.x | 做好同步、截图和卡片体验       | 核心功能已实现，增强与最终验收未完成 | 真机链路、卡片增强、基础书库展示完成，检查通过                        |
| Phase 2 / V2.0 | Book-centric Reading Library   | 规划中                               | Vault、SQLite、迁移、Book/Trace/Asset、Library 与 Book Space 完整工作 |
| Phase 3 / V2.5 | Reading Workspace              | 规划中                               | 选择书籍与资料、建立研究、整理笔记、输出 Obsidian 的闭环              |
| Phase 4 / V3.0 | Portable Reading & Research OS | 规划中                               | 可移动 Vault 恢复完整阅读环境，可选独立 AI Provider 与设备适配        |

## 第一阶段收尾顺序

1. 真机验收：新摘录、新截图、重复扫描、传输中拔出与重连；保存截图、条数和原图校验结果。
2. 修复测试临时端口偶发失败，重新完成全套检查。
3. Card Studio：围绕现有实现补齐 UI、模板、Typography、布局自由度和图片背景；分别验收摘录卡与截图卡。
4. Library 基础视觉、书籍分组与封面；不提前引入 V2 数据架构。
5. 汇总验收证据并明确关闭 Phase 1，再进入 V2 数据模型与迁移设计。

## 验证边界

2026-10-21 本地检查：lint 与 TypeScript 通过；22 个 Node 测试首次 20 通过、2 个因 fetch 的 bad port 失败。相关服务测试单独重跑 5/5 通过。测试使用临时端口，疑似命中受限端口，需要复现并修复；尚未证明根因已关闭。完整命令在 Node 测试处中止，本轮 UI 测试、构建和格式检查未因此获得完整通过结论。2026-10-19 PR #13 的远程 CI quality 已通过。两次结果均保留，不相互替代。

本次归档 PR #14 的远程 CI 在依赖审计步骤失败：当前 Vite 8.3.1 落在新报告的高危漏洞影响范围（8.3.0—8.3.2，GHSA-698v-4r3x-3vcv、GHSA-r825-w8mm-5pxw、GHSA-587h-7wmj-h5pm）。证据：Actions run 39563857032。已在 Projects 列为待修复与回归；本次资料提交不扩大为依赖升级，不将历史 CI 通过描述为当前全绿。

历史记录中的真机截图发现、重复扫描、传输中断验收仍需逐项补证；用户此前确认功能测试成功，不视为每个边界项已经关闭。

## 管理约定

- 已实现、待验收、待开发、规划中分别记录；不将规划项标为完成。
- 每项开发任务包含 Goal、Current behavior、Expected behavior、Scope、Out of scope、涉及文件、数据兼容、Tests 和 Acceptance criteria。
- 现有原始资料、手动同步与本地数据兼容必须保留；涉及删除、迁移、发布和权限的动作遵循用户授权。
- 项目资料进入仓库，工作项和状态进入 GitHub Projects；发布二进制进入 Releases。
- 不上传个人阅读数据、截图原件、备份、运行日志、凭据、依赖缓存及可重新生成的构建缓存。
- 当前没有承诺上线日期；阶段以验收标准推进。
