import { LIMITLESS_API_BASE } from "./config.js";

export interface MarketMeta {
  id: number;
  title: string;
  slug: string;
  description: string;
  conditionId: string;
  categories: string[];
  tags: string[];
  prices: number[];
  volume: string;
  marketType: string;
  tradeType: string;
  status: string;
  expirationDate: string;
  creatorName: string;
  exchange: string;
  tokens: { yes: string; no: string } | null;
}

// Two-tier cache: bulk cache from /markets/active + on-demand per-slug lookups
let marketCache: Map<string, MarketMeta> = new Map();
let slugIndex: Map<string, string> = new Map(); // conditionId -> slug (for on-demand fetches)
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = process.env.LIMITLESS_API_KEY;
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

function toMarketMeta(m: any): MarketMeta | null {
  if (!m.conditionId) return null;
  return {
    id: m.id,
    title: m.title || "Untitled",
    slug: m.slug || "",
    description: m.description || "",
    conditionId: m.conditionId,
    categories: m.categories || [],
    tags: m.tags || [],
    prices: m.prices || [],
    volume: m.volume || "0",
    marketType: m.marketType || "single",
    tradeType: m.tradeType || "clob",
    status: m.status || "unknown",
    expirationDate: m.expirationDate || "",
    creatorName: m.creator?.name || "Unknown",
    exchange: m.venue?.exchange || "",
    tokens: m.tokens || null,
  };
}

export async function refreshMarketCache(): Promise<void> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && marketCache.size > 0) return;

  const headers = getHeaders();

  try {
    // Fetch the active markets (returns ~25 most active with full details)
    const activeRes = await fetch(`${LIMITLESS_API_BASE}/markets/active`, { headers });
    if (!activeRes.ok) throw new Error(`Active endpoint returned ${activeRes.status}`);
    const activeJson = (await activeRes.json()) as { data: any[] };

    const newCache = new Map<string, MarketMeta>();
    for (const m of activeJson.data) {
      const meta = toMarketMeta(m);
      if (meta) newCache.set(meta.conditionId.toLowerCase(), meta);
    }

    // Also fetch the slug index for on-demand lookups (lightweight, single request)
    try {
      const slugsRes = await fetch(`${LIMITLESS_API_BASE}/markets/active/slugs`, { headers });
      if (slugsRes.ok) {
        const slugs = (await slugsRes.json()) as { slug: string }[];
        // We don't know conditionId from slugs alone, but store for search
        // The slug index enables on-demand fetches when cache misses
        slugIndex = new Map();
        for (const s of slugs) {
          slugIndex.set(s.slug, s.slug);
        }
      }
    } catch {
      // Non-critical
    }

    marketCache = newCache;
    cacheTimestamp = now;
  } catch (e) {
    if (marketCache.size === 0) throw e;
  }
}

// On-demand fetch for a specific conditionId not in cache
async function fetchMarketByConditionId(conditionId: string): Promise<MarketMeta | null> {
  const headers = getHeaders();
  try {
    // Try fetching by address (the API accepts conditionId as addressOrSlug)
    const res = await fetch(`${LIMITLESS_API_BASE}/markets/${conditionId}`, { headers });
    if (!res.ok) return null;
    const m = await res.json();
    const meta = toMarketMeta(m);
    if (meta) {
      marketCache.set(meta.conditionId.toLowerCase(), meta);
    }
    return meta;
  } catch {
    return null;
  }
}

export async function getMarketMeta(conditionId: string): Promise<MarketMeta | null> {
  await refreshMarketCache();
  const cached = marketCache.get(conditionId.toLowerCase());
  if (cached) return cached;

  // On-demand fetch for cache miss
  return fetchMarketByConditionId(conditionId);
}

export async function getMarketName(conditionId: string): Promise<string> {
  const meta = await getMarketMeta(conditionId);
  return meta?.title || conditionId.slice(0, 16) + "…";
}

export async function searchMarkets(
  query?: string,
  categories?: string[],
  first = 20
): Promise<MarketMeta[]> {
  // If there's a query, also try the API search endpoint for broader results
  if (query) {
    const headers = getHeaders();
    try {
      const res = await fetch(
        `${LIMITLESS_API_BASE}/markets/search?query=${encodeURIComponent(query)}`,
        { headers }
      );
      if (res.ok) {
        const json = (await res.json()) as { markets: any[] };
        for (const m of json.markets || []) {
          const meta = toMarketMeta(m);
          if (meta) marketCache.set(meta.conditionId.toLowerCase(), meta);
        }
      }
    } catch {
      // Fall back to cache-only search
    }
  }

  await refreshMarketCache();
  let results = Array.from(marketCache.values());

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.slug.toLowerCase().includes(q)
    );
  }

  if (categories && categories.length > 0) {
    const cats = categories.map((c) => c.toLowerCase());
    results = results.filter((m) =>
      m.categories.some((c) => cats.includes(c.toLowerCase()))
    );
  }

  return results.slice(0, first);
}

export async function getAllCachedMarkets(): Promise<MarketMeta[]> {
  await refreshMarketCache();
  return Array.from(marketCache.values());
}
