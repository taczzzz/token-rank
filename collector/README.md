# Token Rank Collector

这个目录里的脚本用于从 Codex 统计页上传“近 3 个月累计 Token 数”。

安全边界：

- 不读取 API Key。
- 不读取 cookie。
- 不读取密码。
- 不读取环境变量。
- 只读取当前页面可见文本。
- 上传前会展示解析结果和上传 JSON，需要用户确认。

## 使用方式

1. 在浏览器打开 Codex 统计页。
2. 通过插件生成上传 prompt。
3. 把 prompt 粘贴给 Codex。
4. Codex 读取本仓库后，只运行 `collector/upload-codex-claim.js`。

