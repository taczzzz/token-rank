(async () => {
  const STORAGE_KEY = "tokenRankCodexBadge";
  const state = await chrome.storage.local.get(["tokenRankCodexConsent", "tokenRankPendingUpload"]);
  if (!state.tokenRankCodexConsent) {
    return { ok: false, error: "需要先在插件里同意读取 Codex 页面" };
  }

  const text = document.body?.innerText || "";
  const result = extractTokenCount(text);
  if (!result.totalTokens) {
    return { ok: false, error: "当前 Codex 页面没有可识别的 token 数" };
  }

  const badge = {
    provider: "codex",
    label: "Codex",
    xHandle: normalizeHandle(state.tokenRankPendingUpload?.xHandle || state.tokenRankPendingUpload?.x_handle),
    totalTokens: result.totalTokens,
    formattedTokens: formatTokens(result.totalTokens),
    rank: calculateRank(result.totalTokens),
    period: "last_3_months",
    confidence: "local_verified",
    source: "codex_visible_last_3_months_total",
    updatedAt: new Date().toISOString(),
    pageUrl: location.href,
    evidence: {
      parser_version: "2026-06-24.2",
      matched_text: result.matchedText,
      page_text_sha256: await sha256(text)
    }
  };

  if (state.tokenRankPendingUpload) {
    const remoteBadge = await uploadBadge(state.tokenRankPendingUpload, badge);
    await chrome.storage.local.set({ [STORAGE_KEY]: remoteBadge });
    return { ok: true, badge: remoteBadge };
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: badge });
  return { ok: true, badge };
})();

function extractTokenCount(text) {
  const normalized = text.replace(/\s+/g, " ");
  const candidates = [
    /(?:last|past|近)\s*(?:90\s*(?:days|天|日)?|三个?月|3\s*个?月|三个月)[^0-9]{0,100}([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数?/,
    /([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数?[^0-9]{0,100}(?:last|past|近)\s*(?:90\s*(?:days|天|日)?|三个?月|3\s*个?月|三个月)/,
    /(?:近\s*3\s*个?月|近三个月|90\s*(?:days|天|日))[^0-9]{0,100}(?:累计|total|usage|用量)[^0-9]{0,80}([0-9][0-9,.]*\s*[kKmMbB万亿]?)/,
    /([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数/,
    /(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数[^0-9]{0,40}([0-9][0-9,.]*\s*[kKmMbB万亿]?)/,
    /([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:tokens?|token|Token|令牌)/
  ];

  for (const pattern of candidates) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        totalTokens: parseCompactNumber(match[1]),
        matchedText: match[0].slice(0, 180)
      };
    }
  }

  return { totalTokens: 0, matchedText: "" };
}

function normalizeHandle(value) {
  return String(value || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

async function uploadBadge(upload, badge) {
  const payload = {
    x_handle: upload.xHandle || upload.x_handle,
    nonce: upload.nonce,
    provider: "codex",
    period: "last_3_months",
    total_tokens: badge.totalTokens,
    source: "extension_visible_page_text",
    page_url: badge.pageUrl,
    evidence: badge.evidence
  };

  const response = await fetch(upload.uploadUrl || upload.upload_url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `上传失败: ${response.status}`);
  }
  return body;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseCompactNumber(value) {
  const cleaned = String(value).replace(/,/g, "").trim();
  const match = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)\s*([kKmMbB万亿])?$/);
  if (!match) {
    return 0;
  }

  const number = Number(match[1]);
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k") {
    return Math.round(number * 1_000);
  }
  if (suffix === "m") {
    return Math.round(number * 1_000_000);
  }
  if (suffix === "b") {
    return Math.round(number * 1_000_000_000);
  }
  if (suffix === "万") {
    return Math.round(number * 10_000);
  }
  if (suffix === "亿") {
    return Math.round(number * 100_000_000);
  }
  return Math.round(number);
}

function calculateRank(totalTokens) {
  const starUnit = 1_000_000_000 / 9;
  const totalStars = Math.floor(totalTokens / starUnit);
  return {
    suns: Math.floor(totalStars / 9),
    moons: Math.floor((totalStars % 9) / 3),
    stars: totalStars % 3,
    totalStars
  };
}

function formatTokens(totalTokens) {
  if (totalTokens >= 1_000_000_000) {
    return `${trimNumber(totalTokens / 1_000_000_000)}B`;
  }
  if (totalTokens >= 1_000_000) {
    return `${trimNumber(totalTokens / 1_000_000)}M`;
  }
  if (totalTokens >= 1_000) {
    return `${trimNumber(totalTokens / 1_000)}K`;
  }
  return new Intl.NumberFormat("en-US").format(totalTokens);
}

function trimNumber(value) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}
