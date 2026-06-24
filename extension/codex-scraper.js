(async () => {
  const STORAGE_KEY = "tokenRankCodexBadge";
  const consent = await chrome.storage.local.get("tokenRankCodexConsent");
  if (!consent.tokenRankCodexConsent) {
    return { ok: false, error: "需要先在插件里同意读取 Codex 页面" };
  }

  const text = document.body?.innerText || "";
  const totalTokens = extractTokenCount(text);
  if (!totalTokens) {
    return { ok: false, error: "当前 Codex 页面没有可识别的 token 数" };
  }

  const badge = {
    provider: "codex",
    label: "Codex",
    totalTokens,
    formattedTokens: formatTokens(totalTokens),
    rank: calculateRank(totalTokens),
    period: "last_3_months",
    confidence: "local_verified",
    source: "codex_visible_last_3_months_total",
    updatedAt: new Date().toISOString(),
    pageUrl: location.href
  };

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
      return parseCompactNumber(match[1]);
    }
  }

  return 0;
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
