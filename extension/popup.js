const CODEX_URL = "https://chatgpt.com/codex";
const STORAGE_KEY = "tokenRankCodexBadge";
const config = window.TokenRankConfig || {};
const API_BASE = config.apiBase || "";
const GITHUB_REPO = config.githubRepo || "https://github.com/xxx/token-rank";

const statusEl = document.getElementById("status");
const rankEl = document.getElementById("rank");
const glyphsEl = document.getElementById("glyphs");
const tokensEl = document.getElementById("tokens");
const updatedEl = document.getElementById("updated");
const xHandleEl = document.getElementById("xHandle");
const promptEl = document.getElementById("prompt");
const claimButton = document.getElementById("claim");
const connectButton = document.getElementById("connect");
const readButton = document.getElementById("read");

claimButton.addEventListener("click", async () => {
  const xHandle = normalizeHandle(xHandleEl.value);
  if (!xHandle) {
    statusEl.textContent = "请先填写 X handle";
    xHandleEl.focus();
    return;
  }
  if (!API_BASE || API_BASE.includes("YOUR_WORKERS_SUBDOMAIN")) {
    statusEl.textContent = "请先配置 Cloudflare Worker API 地址";
    return;
  }

  const response = await fetch(`${API_BASE}/api/claims/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x_handle: xHandle })
  });

  if (!response.ok) {
    statusEl.textContent = "生成上传码失败";
    return;
  }

  const claim = await response.json();
  const prompt = buildCodexPrompt(claim);
  promptEl.hidden = false;
  promptEl.value = prompt;
  promptEl.select();
  await navigator.clipboard?.writeText(prompt).catch(() => {});
  statusEl.textContent = "Prompt 已生成，复制到 Codex";
});

connectButton.addEventListener("click", async () => {
  const granted = await chrome.permissions.request({
    origins: ["https://chatgpt.com/*"]
  });

  if (!granted) {
    statusEl.textContent = "需要同意访问 Codex 页面";
    return;
  }

  await chrome.storage.local.set({ tokenRankCodexConsent: true });
  await chrome.tabs.create({ url: CODEX_URL });
});

readButton.addEventListener("click", async () => {
  const granted = await chrome.permissions.contains({
    origins: ["https://chatgpt.com/*"]
  });

  if (!granted) {
    statusEl.textContent = "请先点击 Connect Codex 并同意访问";
    return;
  }

  await chrome.storage.local.set({ tokenRankCodexConsent: true });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://chatgpt.com/codex")) {
    statusEl.textContent = "请先打开 Codex 页面";
    await chrome.tabs.create({ url: CODEX_URL });
    return;
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["codex-scraper.js"]
  });

  if (result?.result?.ok) {
    await loadState();
  } else {
    statusEl.textContent = result?.result?.error || "没有读到 token 数";
  }
});

loadState();

function normalizeHandle(value) {
  return String(value || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

function buildCodexPrompt(claim) {
  const consoleSnippet = `window.TOKEN_RANK_UPLOAD = {
  uploadUrl: "${claim.upload_url}",
  xHandle: "${claim.x_handle}",
  nonce: "${claim.nonce}"
};`;

  return `请阅读这个 GitHub 仓库：
${GITHUB_REPO}

不要用 Node 运行 collector/upload-codex-claim.js；它必须在 Codex 统计页的浏览器 Console 里运行。

不要读取或上传 API Key、cookie、密码、环境变量或其他隐私数据。

任务：读取当前 Codex 统计页里的“近 3 个月累计 Token 数”，并上传到 Token Rank。

上传参数：
- x_handle: ${claim.x_handle}
- nonce: ${claim.nonce}
- upload_url: ${claim.upload_url}
- period: last_3_months

请按这个方式执行：
1. 打开 Codex 统计页。
2. 打开浏览器 DevTools Console。
3. 先粘贴以下参数：

\`\`\`js
${consoleSnippet}
\`\`\`

4. 再把 collector/upload-codex-claim.js 的完整内容粘贴到同一个 Console 执行。
5. 在上传前，脚本会展示解析到的 token 数、页面上下文和将上传的 JSON；请等待我确认后再上传。`;
}

async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const badge = data[STORAGE_KEY];

  if (!badge) {
    statusEl.textContent = "Codex 未连接";
    rankEl.hidden = true;
    return;
  }

  statusEl.textContent = "Codex 已连接 · 近 3 个月累计";
  rankEl.hidden = false;
  glyphsEl.innerHTML = renderGlyphs(badge.rank);
  tokensEl.textContent = `${badge.formattedTokens} tokens · 近 3 个月累计`;
  updatedEl.textContent = `更新于 ${new Date(badge.updatedAt).toLocaleString()}`;
}

function renderGlyphs(rank) {
  const glyphs = [];
  for (let i = 0; i < Math.min(rank.suns, 6); i += 1) {
    glyphs.push('<span class="glyph sun">☀</span>');
  }
  for (let i = 0; i < rank.moons; i += 1) {
    glyphs.push('<span class="glyph moon">◐</span>');
  }
  for (let i = 0; i < rank.stars; i += 1) {
    glyphs.push('<span class="glyph star">✦</span>');
  }
  return glyphs.join("") || '<span class="glyph star">0</span>';
}
