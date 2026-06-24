(() => {
  const params = globalThis.TOKEN_RANK_UPLOAD || {};
  const uploadUrl = params.uploadUrl || params.upload_url || "";
  const xHandle = normalizeHandle(params.xHandle || params.x_handle);
  const nonce = normalizeNonce(params.nonce);

  if (!uploadUrl || !xHandle || !nonce) {
    throw new Error(
      "Missing TOKEN_RANK_UPLOAD. Example: window.TOKEN_RANK_UPLOAD = { uploadUrl, xHandle, nonce }"
    );
  }

  const pageText = document.body?.innerText || "";
  const result = extractTokenCount(pageText);
  if (!result.totalTokens) {
    throw new Error("No near-3-month cumulative token count was found on this page.");
  }

  const payload = {
    x_handle: xHandle,
    nonce,
    provider: "codex",
    period: "last_3_months",
    total_tokens: result.totalTokens,
    source: "github_collector_visible_page_text",
    page_url: location.href,
    evidence: {
      parser_version: "2026-06-24.1",
      matched_text: result.matchedText,
      page_text_sha256: "calculated-before-upload"
    }
  };

  sha256(pageText).then((hash) => {
    payload.evidence.page_text_sha256 = hash;
    console.log("Token Rank upload preview:", payload);
    const confirmed = confirm(
      `Upload Codex near-3-month cumulative tokens?\n\n${payload.total_tokens.toLocaleString()} tokens\n\nMatched: ${payload.evidence.matched_text}`
    );
    if (!confirmed) {
      console.log("Token Rank upload cancelled.");
      return;
    }

    fetch(uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || `Upload failed: ${response.status}`);
        }
        console.log("Token Rank upload succeeded:", body);
      })
      .catch((error) => {
        console.error("Token Rank upload failed:", error);
      });
  });

  function extractTokenCount(text) {
    const normalized = text.replace(/\s+/g, " ");
    const candidates = [
      /(?:last|past|近)\s*(?:90\s*(?:days|天|日)?|三个?月|3\s*个?月|三个月)[^0-9]{0,100}([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数?/,
      /([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数?[^0-9]{0,100}(?:last|past|近)\s*(?:90\s*(?:days|天|日)?|三个?月|3\s*个?月|三个月)/,
      /(?:近\s*3\s*个?月|近三个月|90\s*(?:days|天|日))[^0-9]{0,100}(?:累计|total|usage|用量)[^0-9]{0,80}([0-9][0-9,.]*\s*[kKmMbB万亿]?)/,
      /([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数/,
      /(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数[^0-9]{0,40}([0-9][0-9,.]*\s*[kKmMbB万亿]?)/
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

  function parseCompactNumber(value) {
    const cleaned = String(value).replace(/,/g, "").trim();
    const match = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)\s*([kKmMbB万亿])?$/);
    if (!match) {
      return 0;
    }

    const number = Number(match[1]);
    const suffix = (match[2] || "").toLowerCase();
    if (suffix === "k") return Math.round(number * 1_000);
    if (suffix === "m") return Math.round(number * 1_000_000);
    if (suffix === "b") return Math.round(number * 1_000_000_000);
    if (suffix === "万") return Math.round(number * 10_000);
    if (suffix === "亿") return Math.round(number * 100_000_000);
    return Math.round(number);
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function normalizeHandle(value) {
    return String(value || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
  }

  function normalizeNonce(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");
  }
})();
