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
4. Codex 读取本仓库后，不要用 Node 运行脚本。
5. Codex 应该把 `collector/browser-console-snippet.js` 里的占位参数替换成 prompt 提供的参数，然后拼接 `collector/upload-codex-claim.js` 的内容。
6. 把拼接后的完整 JavaScript 粘贴到 Codex 统计页的浏览器 Console 执行。

`collector/upload-codex-claim.js` 依赖浏览器页面上下文里的：

```js
window.TOKEN_RANK_UPLOAD = { uploadUrl, xHandle, nonce }
```

如果在 Node 里运行，会按设计报错 `Missing TOKEN_RANK_UPLOAD`。
