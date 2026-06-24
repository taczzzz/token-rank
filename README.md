# Token Rank for X

一个最小可运行的 X 浏览器插件原型：在 X 个人主页里显示 Codex 近三个月累计 token 等级，视觉位置参考 xhunt 的资料区信息行。

现在包含三部分：

- `extension/`：浏览器插件。
- `worker/`：Cloudflare Worker 上传接口。
- `collector/`：给 Codex 阅读和运行的上传脚本。

## 可信模型

大众版不要求用户提供 OpenAI Admin Key。用户打开 Codex 统计页后，在插件里填写 X handle 并点击 `上传当前页面`。插件会生成一次性上传码，从当前页面读取“近 3 个月累计 Token 数”，再上传到 Cloudflare Worker。

```text
插件生成 nonce -> 插件读取当前 Codex 页面 -> Worker 校验证据 -> X 插件展示远端 badge
```

这不是官方 API 级别的 `API Verified`，首版展示为 `Codex Verified`。它适合大众传播和低门槛安装，但不能达到官方 API 的绝对防作弊。

当前防篡改措施：

- 一次性 `nonce`，30 分钟过期，用后失效。
- 用户不手填 token 数，collector 从页面可见文本解析。
- 上传时提交 `matched_text` 和 `page_text_sha256`。
- Worker 重新解析 `matched_text`，和 `total_tokens` 对不上会拒绝。
- 插件只读取当前页面可见文本，不读取 cookie、API Key、密码或环境变量。

## 等级规则

```text
1B tokens = 1 太阳
0.33B tokens = 1 月亮
0.11B tokens = 1 星星
1 太阳 = 3 月亮 = 9 星星
```

当前默认读取 Codex 统计页里的近三个月累计 token。

## Cloudflare 部署

1. 安装依赖：

```bash
npm install
```

2. 登录 Cloudflare：

```bash
npx wrangler login
```

3. 创建 D1：

```bash
npm run d1:create
```

把输出里的 `database_id` 填到 `wrangler.jsonc`。

4. 应用 D1 schema：

```bash
npm run d1:migrate:remote
```

5. 部署 Worker：

```bash
npm run worker:deploy
```

6. 把部署后的 Worker 地址写到：

```text
extension/config.js
```

## 插件运行

1. 加载插件：

```text
Chrome/Edge -> chrome://extensions -> Developer mode -> Load unpacked -> 选择 extension/
```

2. 点击浏览器工具栏里的 Token Rank 插件。

3. 打开 Codex 统计页。

4. 在插件里填写 X handle，点击 `上传当前页面`。

5. 上传成功后，打开 X 用户主页，例如：

```text
https://x.com/shngyo1taczzzz
```

## 检查

```bash
npm run check
```

## 生产化还缺的部分

- Worker 域名固定后，把 `extension/config.js` 里的 `apiBase` 改成真实 API。
- 如果要更可信，需要官方 API 授权或商店签名插件。
- 如果要公开上架，需要补隐私政策和更完整的权限说明。
