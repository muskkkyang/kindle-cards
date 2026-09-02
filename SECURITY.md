# Security Policy

## Supported version

安全修复目前只维护最新的 `main` 分支和最新 GitHub Release。

## Reporting a vulnerability

请不要在公开 Issue 中披露尚未修复的安全问题。使用 GitHub 的私密安全报告入口：

https://github.com/muskkkyang/kindle-flomo-cards/security/advisories/new

报告中请包含：

- 受影响版本或提交
- 可复现的最小步骤
- 预期影响
- 已知的缓解方式

通常会在 7 天内确认收到报告。修复完成前，请避免公开利用细节。

## Security model

Kindle Flomo Cards 是本地应用，不包含身份认证或远程数据服务。安全边界包括：

- 服务只监听 `127.0.0.1`
- 文件读取范围限定为已连接 Kindle 的 `My Clippings.txt`
- 导入文件在浏览器内解析，并限制为 25 MB
- 页面使用内容安全策略和基础安全响应头
- 项目不收集遥测，也不自动发送阅读内容

如果修改监听地址、文件访问范围、剪贴板行为或外部网络请求，请在 PR 中明确说明新的安全边界。
