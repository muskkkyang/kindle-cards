# Kindle Cards 后续开发项目计划书
## ——从 Kindle 摘录工具到 Portable Reading & Research OS

**项目性质：** 个人长期维护的开源产品<br>
**计划版本：** 1.0<br>
**规划周期：** 2026—长期<br>
**当前阶段：** V1.x → V2.0 架构演进期

**2026-10-21 实施更新：** v1.4.0-rc.1 已实现 Phase 1 的基础书籍分组/封面、书页模板、字体排版、留白对齐与图片背景，并修复真机 MTP 截图漏检；真机发现、去重、编辑与 OCR 已补证。确切传输中拔出仍待验证，第一阶段整体验收尚未关闭。详见 docs/V1.4-acceptance.md；Phase 2—4 仍为规划。

---

## 一、项目概述

### 1.1 当前产品

[已知｜置信度：高] Kindle Cards 当前已经形成一条完整的本地阅读摘录处理链路：

**Kindle / My Clippings.txt → 本地解析 → 摘录整理 → 编辑与搜索 → 卡片生成 → PNG / ZIP 输出。**

[已知｜置信度：高] 当前产品坚持 local-first，不要求用户注册账号，不依赖云服务或外部 API，阅读数据主要保存在浏览器本地环境中。

[已知｜置信度：高] 当前系统通过本地 Node.js 服务识别盘符或 Windows MTP/WPD 连接的 Kindle。页面可见时每 5 秒检查 `My Clippings.txt` 与截图变化，内容变化后自动增量合并，并保留手动同步入口。

[已知｜置信度：高] 当前数据结构以 `Memo` 为核心，每条记录直接包含书名、作者、摘录、评论、标签、页码、位置等信息，并不存在独立的 Book、Asset、Research Project 等一级实体。

[已知｜置信度：高] 当前摘录仍保存在浏览器 `localStorage`，并设置 20,000 条上限；截图及编辑历史保存在本地文件目录。v1.3.0 已增加包含两类资料的完整备份与恢复，以及多窗口写入冲突保护。

---

# 二、长期产品定义

[框架｜置信度：高] Kindle Cards 长期不再定义为：

> Kindle 摘录美化工具。

[框架｜置信度：高] 而定义为：

> **Portable Reading & Research OS**
>
> 一个本地优先、设备无关、用户完全掌握数据和 AI 能力的个人阅读、思考、研究与创作环境。

[框架｜置信度：高] 产品最终管理的对象不是单纯的“摘录”，而是一条完整认知链：

**Book → Reading → Thinking → Research → Creation**

即：

**书籍 → 阅读行为 → 阅读痕迹 → 思考 → 研究 → 写作与表达。**

---

# 三、核心产品原则

## 3.1 Local First

[框架｜置信度：高] 用户的书架、摘录、截图、笔记、研究数据和 AI 对话默认存储在用户自己的设备中。

[框架｜置信度：高] 云端服务只能作为可选能力，而不得成为产品正常工作的必要条件。

---

## 3.2 User-Owned Data

[框架｜置信度：高] 数据格式应尽可能开放、可迁移、可备份。

[框架｜置信度：高] Kindle Cards 不应制造新的数据孤岛。

用户应始终能够：

- 导出自己的数据；
- 直接访问自己的文件；
- 将数据迁移到其他知识工具；
- 在停止使用 Kindle Cards 后继续读取历史数据。

---

## 3.3 Device Agnostic

[框架｜置信度：高] Kindle 是第一代也是最重要的硬件适配对象，但不是产品边界。

未来输入来源包括但不限于：

- Kindle；
- Kobo；
- PocketBook；
- EPUB；
- PDF；
- 浏览器；
- 图片与截图；
- Markdown；
- Obsidian；
- 其他本地文件系统。

[框架｜置信度：高] 所有设备差异应尽可能封装在 Adapter Layer，而不是渗透进入核心业务模型。

---

## 3.4 Portable First

[框架｜置信度：高] Kindle Cards 应逐步支持将完整阅读环境存放于一个可移动的 Reading Vault 中。

Reading Vault 可以位于：

- Kindle；
- U 盘；
- 移动 SSD；
- 本机目录；
- NAS；
- 用户自行选择的同步目录。

[框架｜置信度：高] 核心原则是：

> **Reading Vault 在哪里，用户的私人书房就在哪里。**

---

## 3.5 AI Provider Independence

[框架｜置信度：高] Kindle Cards 不绑定单一 AI 服务。

AI 应采用 Provider Adapter 设计。

未来支持：

- OpenAI；
- Anthropic；
- Gemini；
- DeepSeek；
- OpenRouter；
- Ollama；
- OpenAI-compatible API；
- 用户自建模型接口。

[框架｜置信度：高] API Key 默认由用户自己配置并本地保存。

---

## 3.6 Books as First-Class Objects

[框架｜置信度：高] “书”必须从现有 memo 字段中的 `title` 升级为系统中的一级实体。

未来系统关系应从：

```text
Memo
Memo
Memo
Memo
```

变成：

```text
Book
│
├── Highlights
├── Notes
├── Screenshots
├── Bookmarks
├── Reading Sessions
├── Research
└── Creations
```

[推断｜置信度：高] 这是 Kindle Cards 从摘录工具升级为阅读环境最重要的一次数据模型变化。

---

# 四、核心系统架构

[框架｜置信度：高] Kindle Cards 长期采用四层结构。

```text
┌────────────────────────────────────┐
│          Experience Layer          │
│                                    │
│ Shelf / Book Space / Studio /      │
│ Research / Search / Timeline       │
├────────────────────────────────────┤
│        Intelligence Layer          │
│                                    │
│ AI / Semantic Search / Agents /    │
│ Knowledge Connections              │
├────────────────────────────────────┤
│           Reading Core             │
│                                    │
│ Books / Traces / Assets /          │
│ Projects / Creations               │
├────────────────────────────────────┤
│             Adapters               │
│                                    │
│ Kindle / Kobo / EPUB / PDF /       │
│ Obsidian / Filesystem / Browser    │
└────────────────────────────────────┘
```

---

# 五、核心数据模型

## 5.1 Vault

[框架｜置信度：高] `Vault` 是整个产品中最高级的数据容器。

建议结构：

```text
Reading Vault
│
├── Library
├── Traces
├── Assets
├── Research
├── Creations
├── Connections
└── Settings
```

---

## 5.2 Book

建议字段：

```text
Book

id
title
subtitle
author
publisher
isbn
language
cover
source
format
createdAt
updatedAt
readingStatus
readingProgress
metadata
```

---

## 5.3 Reading Trace

[框架｜置信度：高] 所有阅读过程中产生的行为统一抽象为 Reading Trace。

包括：

```text
Highlight
Note
Bookmark
Screenshot
Reading Session
Comment
Quote
```

统一基础结构：

```text
Trace

id
bookId
type
content
location
page
createdAt
source
tags
metadata
```

---

## 5.4 Asset

用于保存：

```text
Screenshot
Image
Book Cover
Scan
Attachment
```

---

## 5.5 Research Project

建议结构：

```text
ResearchProject
│
├── Question
├── Sources
├── Selected Traces
├── AI Sessions
├── Notes
├── Arguments
└── Outputs
```

---

## 5.6 Creation

用于承接阅读后的输出：

```text
Card
Essay
Memo
Research Note
Social Post
Export
```

[框架｜置信度：高] 现有 Card 应迁移到 Creation 体系中，而不再承担整个产品的核心定位。

---

# 六、Reading Vault

## 6.1 目标

[框架｜置信度：高] Reading Vault 是 Kindle Cards 长期最重要的基础设施之一。

建议目录：

```text
My Reading Vault/
│
├── vault.db
│
├── library/
├── traces/
├── assets/
├── research/
├── creations/
├── connections/
└── settings/
```

---

## 6.2 数据库

[推断｜置信度：高] V2.0 应逐步从 localStorage 迁移到 SQLite 或同等级本地数据库方案。

原因包括：

- 数据规模扩大；
- Book / Trace / Asset 等实体关系增加；
- 搜索需求复杂化；
- 需要索引；
- 需要迁移能力；
- 需要 Portable Vault；
- 未来需要全文搜索与 AI retrieval。

[推断｜置信度：高] localStorage 可以保留为少量 UI 设置的存储方式，但不应继续作为核心阅读数据库。

---

# 七、主要产品模块

# 7.1 Library / Shelf

[框架｜置信度：高] Library 将成为应用默认首页。

首页主要展示：

- 最近阅读；
- 全部书籍；
- 阅读状态；
- 阅读统计；
- 最近摘录；
- 最近截图；
- 最近研究。

视图支持：

```text
Shelf
Grid
List
Timeline
```

[推断｜置信度：高] Complete Shelf 式 3D 书架可以作为 Shelf View 的高级呈现方式，但不得成为唯一交互方式。

---

# 7.2 Book Space

[框架｜置信度：高] 每一本书拥有自己的独立工作空间。

Book Space 包括：

### Overview

封面、作者、元数据、阅读进度。

### Highlights

全部划线。

### Notes

阅读笔记。

### Screenshots

阅读截图。

### Timeline

围绕这本书发生的阅读历史。

### Research

围绕本书建立的研究任务。

### Creations

由本书产生的卡片、文章、研究输出。

---

# 7.3 Screenshot Workspace

[框架｜置信度：高] Kindle 截图应成为一级阅读资料，而不是普通图片附件。

流程：

```text
Screenshot
↓
自动归属书籍
↓
裁切
↓
OCR
↓
文字识别
↓
高亮
↓
批注
↓
视觉美化
↓
Card / Note / Research
```

可支持：

- 去除 Kindle UI；
- 自动裁边；
- OCR；
- 文字选区；
- 加入书名；
- 加入页码；
- 添加封面；
- 排版模板；
- 社交媒体尺寸；
- 保留原始截图。

---

# 7.4 Card Studio

[框架｜置信度：高] Card Studio 继续保留，并升级为通用 Creation Studio。

输入可以来自：

- highlight；
- note；
- screenshot；
- AI output；
- research；
- quote；
- image。

输出包括：

- 横卡；
- 1:1；
- 3:4；
- 公众号横图；
- 自定义尺寸。

---

# 7.5 AI Workspace

[框架｜置信度：高] AI 不应设计成普通聊天机器人。

AI 应始终具有当前阅读上下文。

例如：

```text
当前书籍
+
用户选择的摘录
+
笔记
+
截图
+
Research Project
```

之后执行具体操作：

```text
Explain
Compare
Challenge
Summarize
Trace Concept
Find Connections
Draft Note
Start Research
```

---

## 7.6 Research Mode

典型流程：

```text
Select Book / Traces
        ↓
Create Research Project
        ↓
Define Question
        ↓
Collect Sources
        ↓
AI-assisted Exploration
        ↓
Argument / Counterargument
        ↓
Notes
        ↓
Draft
```

[框架｜置信度：高] AI 的作用是辅助整理、比较、检索与写作，而不是替代原始资料。

---

# 7.7 Search

未来统一搜索对象：

```text
Books
Highlights
Notes
Screenshots
Tags
Research
Creations
```

发展路线：

### 第一阶段

全文关键词搜索。

### 第二阶段

结构化筛选。

### 第三阶段

本地 embedding / semantic search。

---

# 7.8 Obsidian Connection

[框架｜置信度：高] Obsidian 不应只做成“导出目标”。

长期方向是建立双向连接。

例如：

```text
Kindle Cards
     ↕
Reading Vault
     ↕
Obsidian
```

建议支持 URI：

```text
kc://book/{id}
kc://trace/{id}
kc://research/{id}
```

Markdown 可以保存 Kindle Cards 引用：

```text
---
kindle-cards-book: kc://book/123
---
```

---

# 八、Adapter Architecture

所有输入设备统一走：

```text
External Source
      ↓
Adapter
      ↓
Normalized Data
      ↓
Reading Core
```

---

## 第一批 Adapter

### Kindle Adapter

负责：

- 设备检测；
- My Clippings；
- Screenshot；
- 文件变化监听；
- 增量同步。

### File Adapter

负责：

- TXT；
- Markdown；
- EPUB；
- PDF。

### Obsidian Adapter

负责：

- Markdown 读写；
- backlink；
- URI。

---

## 中长期 Adapter

```text
Kobo
PocketBook
Browser
Calibre
Readwise Import
OPDS
```

[框架｜置信度：高] 第三方来源应作为 Adapter 存在，不得污染 Reading Core。

---

# 九、自动同步体系

## 9.1 Kindle 自动同步

现状：

```text
连接 Kindle
↓
点击同步
↓
读取 My Clippings
```

目标：

```text
连接 Kindle
↓
自动识别
↓
检测文件变化
↓
增量读取
↓
自动 merge
↓
显示同步结果
```

需要处理：

- 重复记录；
- 修改后的 Note；
- 删除；
- 不同 Kindle；
- 相同书籍不同版本；
- 文件编码；
- 异常拔出设备。

---

## 9.2 Screenshot 自动发现

目标：

```text
Kindle connected

12 new screenshots found

[Import]
```

自动建立：

```text
Screenshot
→ Device
→ Book
→ Time
→ Page / Location
```

无法自动识别时允许用户手动归属。

---

# 十、交互与视觉设计原则

## 10.1 从 Dashboard 转为 Personal Library

[推断｜置信度：高] 当前产品视觉上的主要问题并不是单纯“不够漂亮”，而是 UI 仍然表达的是工具逻辑。

未来首屏应该表达：

> **这是我的私人书房。**

而不是：

> 这是一个处理摘录的后台工具。

---

## 10.2 设计关键词

```text
quiet
editorial
tactile
literary
personal
warm
precise
minimal
```

[框架｜置信度：高] 视觉风格应避免典型 SaaS Dashboard 设计。

减少：

- 大量蓝色按钮；
- 数据后台式组件；
- 功能面板堆积；
- AI 产品常见渐变；
- 无意义卡片化。

增加：

- 书籍实体感；
- 留白；
- 排版；
- 纸张质感；
- 阅读节奏；
- 图书编辑设计语言。

---

# 十一、开发路线

# Phase 1 — V1.x
## Make Kindle Cards Excellent

目标：

> 把当前产品彻底做好。

优先级：最高。

主要工作：

### P0

- 修复现有功能 Bug；
- 完善 Kindle 自动识别；
- 文件变化监听；
- 自动增量同步；
- 数据 merge 稳定性；
- 错误提示。

### P1

- Screenshot 导入；
- Screenshot 自动检测；
- Screenshot 编辑；
- OCR；
- Screenshot Card。

### P1

- Card Studio UI 重构；
- 更多模板；
- Typography；
- 布局自由度；
- 图片背景；
- Screenshot Card。

### P2

- Library 基础视觉升级；
- Book grouping；
- Book cover。

---

## V1.x 验收标准

满足：

```text
插入 Kindle
↓
系统自动识别
↓
自动发现新摘录
↓
自动发现新截图
↓
用户无需选择 My Clippings.txt
```

同时：

- 不产生重复 memo；
- 同步失败不破坏原始数据；
- Screenshot 可以完整完成“导入—编辑—输出”。

---

# Phase 2 — V2.0
## Reading Library

目标：

> 完成从 Memo App 到 Book-centric Library 的转型。

核心任务：

### 数据层

- 引入 Reading Vault；
- 引入 SQLite；
- 数据 migration；
- Book model；
- Trace model；
- Asset model。

### UI

- Library；
- Shelf；
- Book Space；
- Book Timeline；
- Search。

### Adapter

- Kindle Adapter；
- File Adapter。

---

## V2.0 验收标准

用户首次打开产品看到：

> Library

而不是 memo list。

任何摘录必须属于：

```text
Book
  ↓
Trace
```

系统必须可以回答：

```text
我有哪些书？
这本书有哪些摘录？
这本书有哪些截图？
我什么时候读过？
围绕这本书做过什么？
```

---

# Phase 3 — V2.5
## Reading Workspace

目标：

> 从资料管理进入知识工作。

功能：

- Research Project；
- Screenshot Workspace；
- Advanced Search；
- Obsidian Connection；
- URI scheme；
- Research Notes；
- Timeline；
- Related Books；
- Creation Studio。

---

## V2.5 验收标准

用户可以：

```text
选择一本书
↓
选择若干摘录和截图
↓
创建 Research Project
↓
整理问题
↓
撰写自己的研究笔记
↓
输出到 Obsidian
```

---

# Phase 4 — V3.0
## Portable Reading & Research OS

目标：

> 建立完整的个人阅读计算环境。

核心能力：

### Portable Vault

支持：

```text
USB
SSD
Kindle
Local Folder
NAS
```

### AI

- BYOK；
- Provider abstraction；
- Context-aware AI；
- Research Agent；
- Local model support。

### Adapter ecosystem

形成：

```text
Adapter SDK
```

允许第三方贡献设备支持。

---

## V3.0 验收标准

理想体验：

```text
用户连接自己的 Reading Vault
↓
Kindle Cards 自动识别
↓
完整书架恢复
↓
笔记恢复
↓
截图恢复
↓
Research 恢复
↓
AI 配置恢复
```

拔出 Vault 后：

```text
Reading Vault disconnected
```

宿主电脑原则上无需长期保存用户阅读数据。

---

# 十二、当前明确不做的事情

为了防止 scope creep，在相应阶段之前明确不做：

## V1.x 不做

- 社区；
- 关注系统；
- 在线账号；
- 云端书架；
- AI Chat；
- 复杂知识图谱；
- Three.js 3D 书架；
- Kobo；
- PDF Reader；
- 插件市场。

---

## V2.0 不做

- Agent；
- 社交网络；
- 云协作；
- 在线出版平台；
- 推荐算法。

---

# 十三、项目优先级原则

任何新 Feature 必须回答五个问题：

### 1

它是否加强：

**Book → Reading → Thinking → Research → Creation**

其中至少一个环节？

### 2

它是否尊重 local-first？

### 3

它是否增加用户对自己数据的控制，而不是减少？

### 4

它是否可以独立于 Kindle 存在？

### 5

它是否值得增加长期维护成本？

如果其中三个答案是否定：

> 不开发。

---

# 十四、代码架构长期要求

## Core 与 Adapter 分离

禁止：

```text
if kindle...
if kindle...
if kindle...
```

大量进入业务逻辑。

应采用：

```text
adapter.read()
adapter.watch()
adapter.import()
adapter.assets()
```

---

## UI 与数据模型分离

Book Space 不直接操作文件系统。

统一通过：

```text
Repository
Service
Adapter
```

完成。

---

## 数据迁移机制

从 V2 开始所有 Schema 修改必须支持 migration。

禁止：

> 更新版本后要求用户清空数据库。

---

## Raw Data Preservation

原始数据必须保留。

例如：

```text
My Clippings.txt
Screenshot Original
Imported Markdown
```

[框架｜置信度：高] 系统生成的结构化结果可以重新计算，但原始资料不可恢复，因此 Raw Source 应优先保护。

---

# 十五、开发 Agent 工作规则

以后交给 Codex 开发时，每个任务必须说明：

```text
Goal
Current behavior
Expected behavior
Scope
Out of scope
Files likely involved
Data compatibility requirements
Tests
Acceptance criteria
```

禁止任务：

> 优化一下 Kindle Cards。

改为：

> 当 Kindle 已连接并且 My Clippings.txt 发生变化时，
> 本地服务在 5 秒内检测变化，
> 调用现有 parser，
> merge 新记录，
> 不生成重复记录，
> UI 显示同步结果。
>
> 不修改数据 Schema。
> 不引入云服务。
> 保持现有手动同步功能。

---

# 十六、近期开发 Backlog

## P0

### KC-001
自动检测 Kindle 连接。

状态：已完成。

### KC-002
监听 `My Clippings.txt` 文件变化。

状态：已完成页面可见时轮询。

### KC-003
自动增量同步。

状态：已完成。

### KC-004
修复重复同步与 merge 边界问题。

状态：已完成主要边界并持续回归。

### KC-005
完善同步状态 UI。

状态：已完成当前 V1.x 范围。

---

## P1

### KC-101
扫描 Kindle Screenshot。

状态：v1.4.0-rc.1 已补真实 MTP 新截图与重复扫描验收，并修复扩展名隐藏导致的漏检；确切传输中拔出仍待补证。

### KC-102
Screenshot Library。

状态：已完成 V1.x 版本。

### KC-103
Screenshot Crop。

状态：已完成非破坏裁切。

### KC-104
OCR。

状态：已完成 Windows 本地 OCR，结果允许人工校对。

### KC-105
Screenshot Card。

状态：已完成当前主题与尺寸范围。

---

## P1

### KC-120
Card Studio 重构。

状态：v1.4.0-rc.1 已实现并完成本轮软件验收，详见 docs/V1.4-acceptance.md。

### KC-121
Typography System。

状态：v1.4.0-rc.1 已实现并完成本轮软件验收，详见 docs/V1.4-acceptance.md。

### KC-122
Card Layout Engine。

状态：v1.4.0-rc.1 已实现并完成本轮软件验收，详见 docs/V1.4-acceptance.md。

### KC-123
Theme System。

状态：v1.4.0-rc.1 已实现并完成本轮软件验收，详见 docs/V1.4-acceptance.md。

---

## P2

### KC-201
建立 Book ID。

### KC-202
Memo → Trace schema proposal。

### KC-203
Reading Vault prototype。

### KC-204
SQLite technical spike。

---

# 十七、未来判断标准

[框架｜置信度：高] Kindle Cards 成功与否，不以“功能多少”衡量。

真正应该观察的是：

### friction

从阅读产生内容到 Kindle Cards 捕获它需要多少操作？

### retrieval

半年以后还能否找到当时留下的东西？

### context

摘录是否仍然属于一本书和一次阅读经历，而不是孤立文字？

### ownership

用户能否真正掌握自己的数据？

### portability

换一台电脑是否还能恢复自己的阅读环境？

### creation

阅读产生的思想是否能够自然继续进入研究与表达？

---

# 十八、产品长期形态

最终可能形成：

```text
                    Kindle Cards

                        Library
                           │
              ┌────────────┼────────────┐
              │            │            │
            Books        Search       Timeline
              │
          Book Space
              │
 ┌────────────┼──────────────┐
 │            │              │
Traces      Assets        Research
 │            │              │
 │            │              │
 └────────────┴──────┬───────┘
                     │
                  Thinking
                     │
              AI / Connections
                     │
                  Creation
                     │
           Cards / Notes / Essays
```

外围：

```text
Kindle
Kobo
EPUB
PDF
Obsidian
Browser
Filesystem
```

统一通过 Adapter 接入。

---

# 十九、项目北极星

[框架｜置信度：高] Kindle Cards 不应该试图成为另一个大型知识管理平台。

[框架｜置信度：高] 它只专注一件事情：

> **让一个人真正拥有自己一生的阅读环境。**

书籍属于用户。

摘录属于用户。

截图属于用户。

笔记属于用户。

研究属于用户。

AI 接口属于用户。

数据存在哪里也由用户决定。

产品所做的事情，只是让这些散落的阅读痕迹重新形成一个完整、漂亮、可检索、可思考、可研究、可携带的私人世界。

---

## Project Principle

> **Your books. Your traces. Your thinking. Your machine.**
