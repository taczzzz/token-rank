const ROOT_CLASS = "token-rank-x-root";
const CODEX_STORAGE_KEY = "tokenRankCodexBadge";
const config = window.TokenRankConfig || {};
const API_BASE = config.apiBase || "";
const EXCLUDED_PATHS = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "i",
  "settings",
  "compose",
  "search"
]);

let lastHandle = "";
let lastRenderAt = 0;

function currentHandle() {
  const [, rawHandle] = window.location.pathname.split("/");
  const handle = (rawHandle || "").replace(/^@/, "").toLowerCase();
  if (!handle || EXCLUDED_PATHS.has(handle)) {
    return "";
  }
  return handle;
}

function findProfileInsertionPoint() {
  const profileItems = document.querySelector('[data-testid="UserProfileHeader_Items"]');
  if (profileItems?.parentElement) {
    return profileItems.parentElement;
  }

  const userName = document.querySelector('[data-testid="UserName"]');
  if (!userName) {
    return null;
  }

  let node = userName;
  for (let i = 0; i < 6 && node?.parentElement; i += 1) {
    node = node.parentElement;
    if (node.querySelector('[data-testid$="-follow"]') || node.innerText?.includes("Followers")) {
      return node;
    }
  }

  return userName.parentElement;
}

function rankGlyphs(rank) {
  if (!rank) {
    return "";
  }

  const glyphs = [];
  for (let i = 0; i < Math.min(rank.suns, 6); i += 1) {
    glyphs.push('<span class="trx-glyph trx-sun" title="1B tokens">☀</span>');
  }
  for (let i = 0; i < rank.moons; i += 1) {
    glyphs.push('<span class="trx-glyph trx-moon" title="0.33B tokens">◐</span>');
  }
  for (let i = 0; i < rank.stars; i += 1) {
    glyphs.push('<span class="trx-glyph trx-star" title="0.11B tokens">✦</span>');
  }

  if (rank.suns > 6) {
    glyphs.push(`<span class="trx-overflow">+${rank.suns - 6}</span>`);
  }

  return glyphs.join("");
}

function confidenceText(confidence) {
  if (confidence === "codex_assisted_verified") {
    return "Codex Verified";
  }
  if (confidence === "local_verified") {
    return "Local Verified";
  }
  return "Local";
}

function formatChineseTokenUsage(badge) {
  const totalTokens = Number(badge.totalTokens);
  if (Number.isFinite(totalTokens) && totalTokens >= 100_000_000) {
    return `${trimNumber(totalTokens / 100_000_000)}亿`;
  }
  if (Number.isFinite(totalTokens) && totalTokens >= 10_000) {
    return `${trimNumber(totalTokens / 10_000)}万`;
  }
  if (Number.isFinite(totalTokens)) {
    return new Intl.NumberFormat("zh-CN").format(totalTokens);
  }
  return badge.formattedTokens || "已验证";
}

function trimNumber(value) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function renderBadge(container, badge) {
  const usageText = formatChineseTokenUsage(badge);
  const totalStars = badge.rank?.totalStars ?? 0;
  const titleTokens = Number(badge.totalTokens);
  const titleTokenText = Number.isFinite(titleTokens) ? titleTokens.toLocaleString() : usageText;

  container.innerHTML = `
    <div class="trx-card" role="group" aria-label="Codex verified token usage">
      <div class="trx-main">
        <span class="trx-icon" aria-hidden="true">◈</span>
        <strong>近3月token消耗：${usageText}</strong>
        <span class="trx-verified">${confidenceText(badge.confidence)}</span>
      </div>
      <div class="trx-meta">
        <span class="trx-source">Codex</span>
        <span class="trx-rank" aria-label="${totalStars} token stars">${rankGlyphs(badge.rank)}</span>
        <span>${totalStars} 星等级</span>
      </div>
    </div>
  `;
  container.title = `Codex: ${titleTokenText} tokens\nPeriod: ${badge.period}\nSource: ${badge.source}\nUpdated: ${badge.updatedAt}`;
}

function renderError(container) {
  container.innerHTML = `
    <div class="trx-line trx-muted" role="status">
      <span class="trx-icon" aria-hidden="true">◈</span>
      <span>Token Rank 未验证</span>
    </div>
  `;
}

async function inject() {
  const handle = currentHandle();
  if (!handle) {
    return;
  }

  const now = Date.now();
  if (handle === lastHandle && now - lastRenderAt < 3000 && document.querySelector(`.${ROOT_CLASS}`)) {
    return;
  }

  const insertionPoint = findProfileInsertionPoint();
  if (!insertionPoint) {
    return;
  }

  lastHandle = handle;
  lastRenderAt = now;

  let root = insertionPoint.querySelector(`.${ROOT_CLASS}`);
  if (!root) {
    root = document.createElement("div");
    root.className = ROOT_CLASS;
    insertionPoint.append(root);
  }

  root.innerHTML = `
    <div class="trx-line trx-muted" role="status">
      <span class="trx-icon" aria-hidden="true">◈</span>
      <span>Token Rank 检测中</span>
    </div>
  `;

  try {
    const remoteBadge = await fetchRemoteBadge(handle);
    if (remoteBadge) {
      renderBadge(root, remoteBadge);
      return;
    }

    const data = await chrome.storage.local.get(CODEX_STORAGE_KEY);
    if (data[CODEX_STORAGE_KEY]) {
      renderBadge(root, data[CODEX_STORAGE_KEY]);
    } else {
      renderError(root);
    }
  } catch {
    renderError(root);
  }
}

async function fetchRemoteBadge(handle) {
  if (!API_BASE || API_BASE.includes("YOUR_WORKERS_SUBDOMAIN")) {
    return null;
  }

  const response = await fetch(`${API_BASE}/api/badges/x/${encodeURIComponent(handle)}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

const observer = new MutationObserver(() => {
  window.requestAnimationFrame(inject);
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener("popstate", () => {
  lastHandle = "";
  window.requestAnimationFrame(inject);
});

window.requestAnimationFrame(inject);
