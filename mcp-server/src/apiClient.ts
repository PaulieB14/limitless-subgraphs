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

let marketCache: Map<string, MarketMeta> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getApiKey(): string | undefined {
  return process.env.LIMITLESS_API_KEY;
}

export async function refreshMarketCache(): Promise<void> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && marketCache.size > 0) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getApiKey();
  if (apiKey) headers["X-API-Key"] = apiKey;

  try {
    const res = await fetch(`${LIMITLESS_API_BASE}/markets/active`, { headers });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const json = (await res.json()) as { data: any[] };

    const newCache = new Map<string, MarketMeta>();
    for (const m of json.data) {
      if (!m.conditionId) continue;
      newCache.set(m.conditionId.toLowerCase(), {
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
      });
    }

    marketCache = newCache;
    cacheTimestamp = now;
  } catch (e) {
    // If cache exists but is stale, keep using it
    if (marketCache.size === 0) throw e;
  }
}

export async function getMarketMeta(conditionId: string): Promise<MarketMeta | null> {
  await refreshMarketCache();
  return marketCache.get(conditionId.toLowerCase()) || null;
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
