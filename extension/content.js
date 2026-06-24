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

function renderBadge(container, badge) {
  container.innerHTML = `
    <div class="trx-line" role="group" aria-label="Verified token usage rank">
      <span class="trx-icon" aria-hidden="true">◈</span>
      <span class="trx-source">Codex</span>
      <span class="trx-rank">${rankGlyphs(badge.rank)}</span>
      <strong>${badge.formattedTokens}</strong>
      <span>tokens</span>
      <span class="trx-separator">·</span>
      <strong>${badge.rank.totalStars}</strong>
      <span>星</span>
      <span class="trx-verified">${confidenceText(badge.confidence)}</span>
    </div>
  `;
  container.title = `Codex: ${badge.totalTokens.toLocaleString()} tokens\nPeriod: ${badge.period}\nSource: ${badge.source}\nUpdated: ${badge.updatedAt}`;
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
