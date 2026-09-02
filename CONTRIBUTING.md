# Contributing

感谢你愿意改进 Kindle Cards。

## 开始之前

1. 在 Issue 中确认问题尚未被处理。
2. 较大的行为或界面变化先发起讨论，避免重复工作。
3. 不要在 Issue、测试数据或截图中提交真实阅读记录和个人信息。

## 本地开发

```powershell
npm ci
npm run dev
```

提交前必须运行：

```powershell
npm run check
npm audit --audit-level=high
```

## 代码约定

- 保持本地优先，不默认引入账号、云端同步或遥测。
- 优先修复根因，不通过吞掉错误或跳过检查制造“成功”。
- 新的解析规则必须包含对应的匿名化测试样本。
- 用户可见文本优先使用清楚、简短的中文。
- 保持键盘操作、焦点样式、深浅色和窄屏体验可用。
- 不提交 `node_modules`、`dist`、日志、`.env` 或真实 Kindle 数据。

## Pull Request

- 一个 PR 聚焦一个主题。
- 描述问题、解决方式和验证结果。
- 界面变化附桌面与移动端截图。
- 行为变化同步更新 README、测试或架构说明。

推荐使用 Conventional Commits，例如：

```text
fix(parser): preserve edited standalone notes
feat(export): package batch cards as zip
docs: clarify local privacy model
```
