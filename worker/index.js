const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/claims/start") {
        return startClaim(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/claims/upload") {
        return uploadClaim(request, env);
      }

      const badgeMatch = url.pathname.match(/^\/api\/badges\/x\/([^/]+)$/);
      if (request.method === "GET" && badgeMatch) {
        return getBadge(decodeURIComponent(badgeMatch[1]), env);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error.message || "Internal error" }, 500);
    }
  }
};

async function startClaim(request, env) {
  const input = await readJson(request);
  const xHandle = normalizeHandle(input.x_handle || input.xHandle);
  if (!xHandle) {
    return json({ error: "x_handle is required" }, 400);
  }

  const nonce = generateNonce();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `insert into claims (nonce, x_handle, provider, status, created_at, expires_at)
     values (?, ?, 'codex', 'pending', ?, ?)`
  )
    .bind(nonce, xHandle, now.toISOString(), expiresAt)
    .run();

  return json({
    x_handle: xHandle,
    nonce,
    provider: "codex",
    period: "last_3_months",
    expires_at: expiresAt,
    upload_url: `${new URL(request.url).origin}/api/claims/upload`
  });
}

async function uploadClaim(request, env) {
  const input = await readJson(request);
  const xHandle = normalizeHandle(input.x_handle || input.xHandle);
  const nonce = normalizeNonce(input.nonce);
  const totalTokens = Number(input.total_tokens ?? input.totalTokens);

  if (!xHandle || !nonce) {
    return json({ error: "x_handle and nonce are required" }, 400);
  }
  if (!Number.isFinite(totalTokens) || totalTokens < 0 || totalTokens > 100_000_000_000_000) {
    return json({ error: "total_tokens is invalid" }, 400);
  }

  const claim = await env.DB.prepare(
    `select * from claims
     where nonce = ? and x_handle = ? and provider = 'codex'
     order by created_at desc
     limit 1`
  )
    .bind(nonce, xHandle)
    .first();

  if (!claim) {
    return json({ error: "Invalid upload code" }, 403);
  }
  if (claim.status !== "pending") {
    return json({ error: "Upload code already used" }, 409);
  }
  if (Date.parse(claim.expires_at) < Date.now()) {
    return json({ error: "Upload code expired" }, 410);
  }

  const now = new Date().toISOString();
  const evidence = normalizeEvidence(input.evidence);
  const evidenceTokens = parseTokenFromEvidence(evidence.matched_text);
  if (!evidence.page_text_sha256 || !evidence.matched_text || evidenceTokens !== Math.round(totalTokens)) {
    return json({ error: "Evidence does not match total_tokens" }, 400);
  }

  const badge = buildBadge({
    xHandle,
    totalTokens: Math.round(totalTokens),
    source: String(input.source || "codex_assisted_upload"),
    pageUrl: String(input.page_url || input.pageUrl || ""),
    evidence,
    updatedAt: now
  });

  await env.DB.batch([
    env.DB.prepare(
      `update claims
       set status = 'used', total_tokens = ?, uploaded_at = ?
       where id = ?`
    ).bind(badge.totalTokens, now, claim.id),
    env.DB.prepare(
      `insert into badges (
        x_handle, provider, period, total_tokens, formatted_tokens,
        rank_json, confidence, source, page_url, evidence_json, updated_at
      )
      values (?, 'codex', 'last_3_months', ?, ?, ?, 'codex_assisted_verified', ?, ?, ?, ?)
      on conflict(x_handle, provider, period)
      do update set
        total_tokens = excluded.total_tokens,
        formatted_tokens = excluded.formatted_tokens,
        rank_json = excluded.rank_json,
        confidence = excluded.confidence,
        source = excluded.source,
        page_url = excluded.page_url,
        evidence_json = excluded.evidence_json,
        updated_at = excluded.updated_at`
    ).bind(
      xHandle,
      badge.totalTokens,
      badge.formattedTokens,
      JSON.stringify(badge.rank),
      badge.source,
      badge.pageUrl,
      JSON.stringify(evidence),
      badge.updatedAt
    )
  ]);

  return json(badge);
}

async function getBadge(rawHandle, env) {
  const xHandle = normalizeHandle(rawHandle);
  if (!xHandle) {
    return json({ error: "x_handle is required" }, 400);
  }

  const row = await env.DB.prepare(
    `select * from badges
     where x_handle = ?
       and provider = 'codex'
       and period = 'last_3_months'
       and confidence = 'codex_assisted_verified'
     limit 1`
  )
    .bind(xHandle)
    .first();

  if (!row) {
    return json({ error: "Badge not found" }, 404);
  }

  return json({
    public: true,
    xHandle,
    provider: row.provider,
    label: "Codex",
    period: row.period,
    totalTokens: row.total_tokens,
    formattedTokens: row.formatted_tokens,
    rank: JSON.parse(row.rank_json),
    confidence: row.confidence,
    source: row.source,
    updatedAt: row.updated_at
  });
}

function buildBadge({ xHandle, totalTokens, source, pageUrl, evidence, updatedAt }) {
  return {
    provider: "codex",
    label: "Codex",
    period: "last_3_months",
    xHandle,
    totalTokens,
    formattedTokens: formatTokens(totalTokens),
    rank: calculateRank(totalTokens),
    confidence: "codex_assisted_verified",
    source,
    pageUrl,
    evidence,
    updatedAt
  };
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

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS
  });
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

function normalizeEvidence(rawEvidence) {
  const evidence = rawEvidence && typeof rawEvidence === "object" ? rawEvidence : {};
  return {
    parser_version: String(evidence.parser_version || ""),
    matched_text: String(evidence.matched_text || "").slice(0, 500),
    page_text_sha256: String(evidence.page_text_sha256 || "").toLowerCase()
  };
}

function parseTokenFromEvidence(text) {
  const match = String(text || "").match(/([0-9][0-9,.]*\s*[kKmMbB万亿]?)\s*(?:累计\s*)?(?:tokens?|token|Token|令牌)\s*数?/);
  if (!match) {
    return 0;
  }
  return parseCompactNumber(match[1]);
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

function generateNonce() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => (byte % 36).toString(36).toUpperCase());
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}
