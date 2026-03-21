#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { querySimple, queryNegRisk, queryBoth } from "./subgraphClient.js";
import {
  getMarketMeta,
  getMarketName,
  searchMarkets,
  getAllCachedMarkets,
} from "./apiClient.js";
import { SIMPLE_ENDPOINT, NEGRISK_ENDPOINT } from "./config.js";

const server = new McpServer({
  name: "limitless-mcp",
  version: "1.0.0",
});

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// Helper: hydrate an array of items that have a conditionId-like field with market names
async function hydrateName(conditionId: string): Promise<string> {
  return getMarketName(conditionId);
}

// ---------------------------------------------------------------------------
// Tool 1: get_global_stats
// ---------------------------------------------------------------------------
server.registerTool(
  "get_global_stats",
  {
    description:
      "Get combined protocol-wide stats across both simple and negrisk markets. Returns total markets, trades, volume, users, splits, merges, redemptions with per-type breakdown.",
  },
  async () => {
    try {
      const { simple, negrisk } = await queryBoth(
        `{ globalStats(id: "0x73696d706c65") { totalMarkets resolvedMarkets totalTradesCount totalVolumeUSD totalFeesUSD totalUsers totalSplits totalMerges totalRedemptions } _meta { block { number } hasIndexingErrors } }`,
        `{ globalStats(id: "0x6e65677269736b") { totalMarkets resolvedMarkets totalTradesCount totalVolumeUSD totalFeesUSD totalUsers totalSplits totalMerges totalRedemptions } _meta { block { number } hasIndexingErrors } }`
      );

      const s = simple.globalStats || {};
      const n = negrisk.globalStats || {};

      return textResult({
        combined: {
          totalMarkets: (s.totalMarkets || 0) + (n.totalMarkets || 0),
          resolvedMarkets: (s.resolvedMarkets || 0) + (n.resolvedMarkets || 0),
          totalTradesCount:
            BigInt(s.totalTradesCount || "0") + BigInt(n.totalTradesCount || "0"),
          totalVolumeUSD:
            parseFloat(s.totalVolumeUSD || "0") + parseFloat(n.totalVolumeUSD || "0"),
          totalFeesUSD:
            parseFloat(s.totalFeesUSD || "0") + parseFloat(n.totalFeesUSD || "0"),
          totalUsers: (s.totalUsers || 0) + (n.totalUsers || 0),
          totalSplits:
            BigInt(s.totalSplits || "0") + BigInt(n.totalSplits || "0"),
          totalMerges:
            BigInt(s.totalMerges || "0") + BigInt(n.totalMerges || "0"),
          totalRedemptions:
            BigInt(s.totalRedemptions || "0") + BigInt(n.totalRedemptions || "0"),
        },
        simpleMarkets: s,
        negriskMarkets: n,
        sync: {
          simple: simple._meta,
          negrisk: negrisk._meta,
        },
      });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 2: get_market_analytics
// ---------------------------------------------------------------------------
server.registerTool(
  "get_market_analytics",
  {
    description:
      "Get full analytics for a specific market by conditionId. Combines on-chain data (volume, trades, fees, resolution status) with market metadata (title, description, categories). Queries both subgraphs to find the market.",
    inputSchema: {
      conditionId: z.string().describe("The conditionId (hex) of the market"),
    },
  },
  async ({ conditionId }) => {
    try {
      const marketQuery = (entity: string) => `{
        ${entity}(id: "${conditionId}") {
          id venue tradesCount buysCount sellsCount
          volumeUSD buyVolumeUSD sellVolumeUSD feesUSD
          createdAt createdTx
        }
        condition(id: "${conditionId}") {
          id oracle questionId outcomeSlotCount resolved
          payoutNumerators resolvedAt resolvedTx createdAt
        }
      }`;

      const [simpleData, negriskData, meta] = await Promise.all([
        querySimple(marketQuery("market")),
        queryNegRisk(marketQuery("negRiskMarket")),
        getMarketMeta(conditionId),
      ]);

      const onChain = simpleData.market || negriskData.negRiskMarket;
      const condition = simpleData.condition || negriskData.condition;
      const marketType = simpleData.market ? "simple" : negriskData.negRiskMarket ? "negrisk" : "unknown";

      return textResult({
        title: meta?.title || "Unknown",
        description: meta?.description || "",
        categories: meta?.categories || [],
        slug: meta?.slug || "",
        currentPrices: meta?.prices || [],
        expirationDate: meta?.expirationDate || "",
        tradeType: meta?.tradeType || "",
        marketType,
        onChain: onChain || null,
        condition: condition || null,
      });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 3: search_markets
// ---------------------------------------------------------------------------
server.registerTool(
  "search_markets",
  {
    description:
      "Search markets by keyword or category. Returns market metadata enriched with on-chain volume and trade counts from subgraphs.",
    inputSchema: {
      query: z.string().optional().describe("Keyword to search in title/description"),
      categories: z
        .array(z.string())
        .optional()
        .describe("Filter by categories (e.g. ['Crypto', 'Politics'])"),
      first: z.number().default(20).describe("Number of results to return"),
    },
  },
  async ({ query, categories, first }) => {
    try {
      const apiResults = await searchMarkets(query, categories, first);

      // Enrich each result with on-chain stats from subgraphs
      const enriched = await Promise.all(
        apiResults.map(async (m) => {
          const mq = (entity: string) =>
            `{ ${entity}(id: "${m.conditionId}") { tradesCount volumeUSD feesUSD } }`;
          const [s, n] = await Promise.all([
            querySimple(mq("market")).catch(() => ({ market: null })),
            queryNegRisk(mq("negRiskMarket")).catch(() => ({ negRiskMarket: null })),
          ]);
          const onChain = s.market || n.negRiskMarket;
          return {
            title: m.title,
            conditionId: m.conditionId,
            categories: m.categories,
            currentPrices: m.prices,
            expirationDate: m.expirationDate,
            marketType: m.marketType,
            tradeType: m.tradeType,
            status: m.status,
            onChainVolume: onChain?.volumeUSD || "0",
            onChainTrades: onChain?.tradesCount || "0",
            onChainFees: onChain?.feesUSD || "0",
          };
        })
      );

      return textResult({ count: enriched.length, markets: enriched });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 4: get_market_trades
// ---------------------------------------------------------------------------
server.registerTool(
  "get_market_trades",
  {
    description:
      "Get trades for a specific market. Returns trade details with maker/taker, price, volume, and fees from on-chain data.",
    inputSchema: {
      conditionId: z.string().describe("Market conditionId"),
      first: z.number().default(20).describe("Number of trades"),
      tradeType: z
        .enum(["BUY", "SELL"])
        .optional()
        .describe("Filter by trade type"),
      orderDirection: z.enum(["asc", "desc"]).default("desc"),
    },
  },
  async ({ conditionId, first, tradeType, orderDirection }) => {
    try {
      const typeFilter = tradeType ? `, type: "${tradeType}"` : "";
      const tradesQuery = `{
        trades(
          where: { market: "${conditionId}"${typeFilter} }
          first: ${first}
          orderBy: timestamp
          orderDirection: ${orderDirection}
        ) {
          id type maker taker
          makerAmountFilled takerAmountFilled
          amountUSD fee feeUSD price
          venue timestamp blockNumber txHash
        }
      }`;

      const [simpleData, negriskData, name] = await Promise.all([
        querySimple(tradesQuery).catch(() => ({ trades: [] })),
        queryNegRisk(tradesQuery).catch(() => ({ trades: [] })),
        getMarketName(conditionId),
      ]);

      const simpleTrades = (simpleData.trades || []).map((t: any) => ({
        ...t,
        marketType: "simple",
      }));
      const negriskTrades = (negriskData.trades || []).map((t: any) => ({
        ...t,
        marketType: "negrisk",
      }));

      const allTrades = [...simpleTrades, ...negriskTrades]
        .sort((a, b) =>
          orderDirection === "desc"
            ? Number(b.timestamp) - Number(a.timestamp)
            : Number(a.timestamp) - Number(b.timestamp)
        )
        .slice(0, first);

      return textResult({ market: name, conditionId, trades: allTrades });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 5: get_trader_profile
// ---------------------------------------------------------------------------
server.registerTool(
  "get_trader_profile",
  {
    description:
      "Get a trader's profile across both simple and negrisk markets. Shows trade count, volume, fees, PnL, and first/last trade timestamps from on-chain data.",
    inputSchema: {
      address: z.string().describe("Trader wallet address"),
    },
  },
  async ({ address }) => {
    try {
      const addr = address.toLowerCase();
      const userQuery = `{
        user(id: "${addr}") {
          id tradesCount totalVolumeUSD totalFeesUSD realizedPnlUSD
          firstTradeAt lastTradeAt
        }
      }`;

      const { simple, negrisk } = await queryBoth(userQuery, userQuery);
      const s = simple.user;
      const n = negrisk.user;

      if (!s && !n) {
        return textResult({ found: false, message: "No trading activity found for this address" });
      }

      const combined = {
        address: addr,
        tradesCount:
          parseInt(s?.tradesCount || "0") + parseInt(n?.tradesCount || "0"),
        totalVolumeUSD:
          parseFloat(s?.totalVolumeUSD || "0") + parseFloat(n?.totalVolumeUSD || "0"),
        totalFeesUSD:
          parseFloat(s?.totalFeesUSD || "0") + parseFloat(n?.totalFeesUSD || "0"),
        realizedPnlUSD:
          parseFloat(s?.realizedPnlUSD || "0") + parseFloat(n?.realizedPnlUSD || "0"),
        firstTradeAt: [s?.firstTradeAt, n?.firstTradeAt]
          .filter(Boolean)
          .sort()[0] || null,
        lastTradeAt: [s?.lastTradeAt, n?.lastTradeAt]
          .filter(Boolean)
          .sort()
          .reverse()[0] || null,
      };

      return textResult({
        combined,
        simpleMarkets: s || null,
        negriskMarkets: n || null,
      });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 6: get_top_traders
// ---------------------------------------------------------------------------
server.registerTool(
  "get_top_traders",
  {
    description:
      "Get top traders ranked by volume, trade count, or PnL. Queries both subgraphs and merges rankings.",
    inputSchema: {
      orderBy: z
        .enum(["totalVolumeUSD", "tradesCount", "totalFeesUSD"])
        .default("totalVolumeUSD"),
      first: z.number().default(20),
      marketType: z
        .enum(["simple", "negrisk", "all"])
        .default("all")
        .describe("Filter by market type or combine both"),
    },
  },
  async ({ orderBy, first, marketType }) => {
    try {
      const userQuery = `{
        users(first: ${first * 2}, orderBy: ${orderBy}, orderDirection: desc, where: { tradesCount_gt: "0" }) {
          id tradesCount totalVolumeUSD totalFeesUSD realizedPnlUSD
          firstTradeAt lastTradeAt
        }
      }`;

      if (marketType === "simple") {
        const data = await querySimple(userQuery);
        return textResult({ marketType, traders: (data.users || []).slice(0, first) });
      }
      if (marketType === "negrisk") {
        const data = await queryNegRisk(userQuery);
        return textResult({ marketType, traders: (data.users || []).slice(0, first) });
      }

      // Merge both
      const { simple, negrisk } = await queryBoth(userQuery, userQuery);
      const merged = new Map<string, any>();

      for (const u of [...(simple.users || []), ...(negrisk.users || [])]) {
        const existing = merged.get(u.id);
        if (existing) {
          existing.tradesCount =
            parseInt(existing.tradesCount) + parseInt(u.tradesCount);
          existing.totalVolumeUSD =
            parseFloat(existing.totalVolumeUSD) + parseFloat(u.totalVolumeUSD);
          existing.totalFeesUSD =
            parseFloat(existing.totalFeesUSD) + parseFloat(u.totalFeesUSD);
          existing.realizedPnlUSD =
            parseFloat(existing.realizedPnlUSD) + parseFloat(u.realizedPnlUSD);
        } else {
          merged.set(u.id, {
            ...u,
            tradesCount: parseInt(u.tradesCount),
            totalVolumeUSD: parseFloat(u.totalVolumeUSD),
            totalFeesUSD: parseFloat(u.totalFeesUSD),
            realizedPnlUSD: parseFloat(u.realizedPnlUSD),
          });
        }
      }

      const sorted = Array.from(merged.values())
        .sort((a, b) => b[orderBy] - a[orderBy])
        .slice(0, first);

      return textResult({ marketType: "all", traders: sorted });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 7: get_trader_trades
// ---------------------------------------------------------------------------
server.registerTool(
  "get_trader_trades",
  {
    description:
      "Get a trader's recent trades across both market types, enriched with market names.",
    inputSchema: {
      address: z.string().describe("Trader wallet address"),
      first: z.number().default(20),
      role: z
        .enum(["maker", "taker", "both"])
        .default("both")
        .describe("Filter by role in trade"),
    },
  },
  async ({ address, first, role }) => {
    try {
      const addr = address.toLowerCase();
      let where = "";
      if (role === "maker") where = `maker: "${addr}"`;
      else if (role === "taker") where = `taker: "${addr}"`;
      else where = `or: [{maker: "${addr}"}, {taker: "${addr}"}]`;

      const tradesQuery = `{
        trades(first: ${first}, orderBy: timestamp, orderDirection: desc, where: { ${where} }) {
          id market { id } type maker taker amountUSD feeUSD price venue timestamp txHash
        }
      }`;

      const negriskTradesQuery = tradesQuery.replace("market { id }", "market { id }");

      const { simple, negrisk } = await queryBoth(tradesQuery, negriskTradesQuery);

      const allTrades = [
        ...(simple.trades || []).map((t: any) => ({ ...t, marketType: "simple" })),
        ...(negrisk.trades || []).map((t: any) => ({ ...t, marketType: "negrisk" })),
      ]
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
        .slice(0, first);

      // Hydrate market names
      const conditionIds = [...new Set(allTrades.map((t: any) => t.market?.id).filter(Boolean))];
      const names = new Map<string, string>();
      await Promise.all(
        conditionIds.map(async (id: string) => {
          names.set(id, await hydrateName(id));
        })
      );

      const enriched = allTrades.map((t: any) => ({
        ...t,
        marketName: names.get(t.market?.id) || t.market?.id || "unknown",
      }));

      return textResult({ address: addr, trades: enriched });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 8: get_trader_positions
// ---------------------------------------------------------------------------
server.registerTool(
  "get_trader_positions",
  {
    description:
      "Get a trader's current positions across both market types with balances and PnL.",
    inputSchema: {
      address: z.string().describe("Trader wallet address"),
    },
  },
  async ({ address }) => {
    try {
      const addr = address.toLowerCase();
      const posQuery = `{
        userPositions(where: { user: "${addr}", balance_gt: "0" }, first: 100) {
          id tokenId balance netCostUSD realizedPnlUSD lastUpdated
          condition { id resolved payoutNumerators }
        }
      }`;

      const { simple, negrisk } = await queryBoth(posQuery, posQuery);

      const allPositions = [
        ...(simple.userPositions || []).map((p: any) => ({ ...p, marketType: "simple" })),
        ...(negrisk.userPositions || []).map((p: any) => ({ ...p, marketType: "negrisk" })),
      ];

      // Hydrate condition names
      const conditionIds = [
        ...new Set(allPositions.map((p: any) => p.condition?.id).filter(Boolean)),
      ];
      const names = new Map<string, string>();
      await Promise.all(
        conditionIds.map(async (id: string) => {
          names.set(id, await hydrateName(id));
        })
      );

      const enriched = allPositions.map((p: any) => ({
        ...p,
        marketName: names.get(p.condition?.id) || p.condition?.id || "unknown",
      }));

      return textResult({ address: addr, positionCount: enriched.length, positions: enriched });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 9: get_daily_protocol_stats
// ---------------------------------------------------------------------------
server.registerTool(
  "get_daily_protocol_stats",
  {
    description:
      "Get daily protocol stats (volume, trades, fees, splits, merges, redemptions) across both market types as a time series.",
    inputSchema: {
      days: z.number().default(30).describe("Number of days to return"),
    },
  },
  async ({ days }) => {
    try {
      const snapshotQuery = `{
        globalDailySnapshots(first: ${days}, orderBy: dayId, orderDirection: desc) {
          dayId date totalTradesCount totalVolumeUSD totalFeesUSD
          totalSplits totalMerges totalRedemptions
        }
      }`;

      const { simple, negrisk } = await queryBoth(snapshotQuery, snapshotQuery);

      // Merge by dayId
      const merged = new Map<number, any>();
      for (const s of simple.globalDailySnapshots || []) {
        merged.set(s.dayId, {
          dayId: s.dayId,
          date: s.date,
          simpleTradesCount: s.totalTradesCount,
          simpleVolumeUSD: s.totalVolumeUSD,
          simpleFeesUSD: s.totalFeesUSD,
          simpleSplits: s.totalSplits,
          simpleMerges: s.totalMerges,
          simpleRedemptions: s.totalRedemptions,
          negriskTradesCount: "0",
          negriskVolumeUSD: "0",
          negriskFeesUSD: "0",
          negriskSplits: "0",
          negriskMerges: "0",
          negriskRedemptions: "0",
        });
      }
      for (const n of negrisk.globalDailySnapshots || []) {
        const existing = merged.get(n.dayId);
        if (existing) {
          existing.negriskTradesCount = n.totalTradesCount;
          existing.negriskVolumeUSD = n.totalVolumeUSD;
          existing.negriskFeesUSD = n.totalFeesUSD;
          existing.negriskSplits = n.totalSplits;
          existing.negriskMerges = n.totalMerges;
          existing.negriskRedemptions = n.totalRedemptions;
        } else {
          merged.set(n.dayId, {
            dayId: n.dayId,
            date: n.date,
            simpleTradesCount: "0",
            simpleVolumeUSD: "0",
            simpleFeesUSD: "0",
            simpleSplits: "0",
            simpleMerges: "0",
            simpleRedemptions: "0",
            negriskTradesCount: n.totalTradesCount,
            negriskVolumeUSD: n.totalVolumeUSD,
            negriskFeesUSD: n.totalFeesUSD,
            negriskSplits: n.totalSplits,
            negriskMerges: n.totalMerges,
            negriskRedemptions: n.totalRedemptions,
          });
        }
      }

      // Add combined totals
      const snapshots = Array.from(merged.values())
        .sort((a, b) => b.dayId - a.dayId)
        .slice(0, days)
        .map((s) => ({
          ...s,
          totalTradesCount:
            parseInt(s.simpleTradesCount) + parseInt(s.negriskTradesCount),
          totalVolumeUSD:
            parseFloat(s.simpleVolumeUSD) + parseFloat(s.negriskVolumeUSD),
          totalFeesUSD:
            parseFloat(s.simpleFeesUSD) + parseFloat(s.negriskFeesUSD),
        }));

      return textResult({ days: snapshots.length, snapshots });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 10: get_market_daily_snapshots
// ---------------------------------------------------------------------------
server.registerTool(
  "get_market_daily_snapshots",
  {
    description:
      "Get daily volume, trades, and fees for a specific market over time.",
    inputSchema: {
      conditionId: z.string().describe("Market conditionId"),
      days: z.number().default(30),
    },
  },
  async ({ conditionId, days }) => {
    try {
      const snapshotQuery = `{
        marketDailySnapshots(
          where: { market: "${conditionId}" }
          first: ${days}
          orderBy: dayId
          orderDirection: desc
        ) {
          dayId date tradesCount volumeUSD buyVolumeUSD sellVolumeUSD feesUSD
        }
      }`;

      const [simpleData, negriskData, name] = await Promise.all([
        querySimple(snapshotQuery).catch(() => ({ marketDailySnapshots: [] })),
        queryNegRisk(snapshotQuery).catch(() => ({ marketDailySnapshots: [] })),
        getMarketName(conditionId),
      ]);

      const snapshots =
        simpleData.marketDailySnapshots?.length > 0
          ? simpleData.marketDailySnapshots
          : negriskData.marketDailySnapshots || [];

      return textResult({ market: name, conditionId, snapshots });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 11: compare_market_types
// ---------------------------------------------------------------------------
server.registerTool(
  "compare_market_types",
  {
    description:
      "Side-by-side comparison of simple vs negrisk market performance. Shows volume share, trade counts, fees, and activity breakdown.",
  },
  async () => {
    try {
      const { simple, negrisk } = await queryBoth(
        `{ globalStats(id: "0x73696d706c65") { totalMarkets resolvedMarkets totalTradesCount totalVolumeUSD totalFeesUSD totalUsers totalSplits totalMerges totalRedemptions } }`,
        `{ globalStats(id: "0x6e65677269736b") { totalMarkets resolvedMarkets totalTradesCount totalVolumeUSD totalFeesUSD totalUsers totalSplits totalMerges totalRedemptions } }`
      );

      const s = simple.globalStats || {};
      const n = negrisk.globalStats || {};

      const totalVolume =
        parseFloat(s.totalVolumeUSD || "0") + parseFloat(n.totalVolumeUSD || "0");
      const totalTrades =
        parseInt(s.totalTradesCount || "0") + parseInt(n.totalTradesCount || "0");

      return textResult({
        simple: {
          ...s,
          volumeShare:
            totalVolume > 0
              ? ((parseFloat(s.totalVolumeUSD || "0") / totalVolume) * 100).toFixed(1) + "%"
              : "0%",
          tradeShare:
            totalTrades > 0
              ? ((parseInt(s.totalTradesCount || "0") / totalTrades) * 100).toFixed(1) + "%"
              : "0%",
        },
        negrisk: {
          ...n,
          volumeShare:
            totalVolume > 0
              ? ((parseFloat(n.totalVolumeUSD || "0") / totalVolume) * 100).toFixed(1) + "%"
              : "0%",
          tradeShare:
            totalTrades > 0
              ? ((parseInt(n.totalTradesCount || "0") / totalTrades) * 100).toFixed(1) + "%"
              : "0%",
        },
        totals: {
          totalVolumeUSD: totalVolume,
          totalTradesCount: totalTrades,
        },
      });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 12: get_market_positions
// ---------------------------------------------------------------------------
server.registerTool(
  "get_market_positions",
  {
    description:
      "Get top position holders for a specific market. Shows who holds the biggest positions and their PnL.",
    inputSchema: {
      conditionId: z.string().describe("Market conditionId"),
      first: z.number().default(20),
    },
  },
  async ({ conditionId, first }) => {
    try {
      const posQuery = `{
        userPositions(
          where: { condition: "${conditionId}", balance_gt: "0" }
          first: ${first}
          orderBy: balance
          orderDirection: desc
        ) {
          id user { id tradesCount totalVolumeUSD } tokenId balance
          netCostUSD realizedPnlUSD lastUpdated
        }
      }`;

      const [simpleData, negriskData, name] = await Promise.all([
        querySimple(posQuery).catch(() => ({ userPositions: [] })),
        queryNegRisk(posQuery).catch(() => ({ userPositions: [] })),
        getMarketName(conditionId),
      ]);

      const positions = [
        ...(simpleData.userPositions || []),
        ...(negriskData.userPositions || []),
      ]
        .sort((a, b) => parseInt(b.balance) - parseInt(a.balance))
        .slice(0, first);

      return textResult({ market: name, conditionId, positionCount: positions.length, positions });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 13: get_liquidity_events
// ---------------------------------------------------------------------------
server.registerTool(
  "get_liquidity_events",
  {
    description:
      "Get splits, merges, and redemptions — the liquidity lifecycle events. Filter by market or user address.",
    inputSchema: {
      conditionId: z.string().optional().describe("Filter by market conditionId"),
      address: z.string().optional().describe("Filter by user address"),
      first: z.number().default(20),
    },
  },
  async ({ conditionId, address, first }) => {
    try {
      const condFilter = conditionId ? `conditionId: "${conditionId}"` : "";
      const addrFilter = address ? `stakeholder: "${address.toLowerCase()}"` : "";
      const redAddrFilter = address ? `redeemer: "${address.toLowerCase()}"` : "";
      const where = [condFilter, addrFilter].filter(Boolean).join(", ");
      const redWhere = [condFilter, redAddrFilter].filter(Boolean).join(", ");

      const eventQuery = `{
        splits(first: ${first}, orderBy: timestamp, orderDirection: desc${where ? `, where: { ${where} }` : ""}) {
          id stakeholder { id } conditionId amount amountUSD timestamp txHash
        }
        merges(first: ${first}, orderBy: timestamp, orderDirection: desc${where ? `, where: { ${where} }` : ""}) {
          id stakeholder { id } conditionId amount amountUSD timestamp txHash
        }
        redemptions(first: ${first}, orderBy: timestamp, orderDirection: desc${redWhere ? `, where: { ${redWhere} }` : ""}) {
          id redeemer { id } conditionId payout payoutUSD timestamp txHash
        }
      }`;

      const { simple, negrisk } = await queryBoth(eventQuery, eventQuery);

      // Merge all events into a unified feed
      const events: any[] = [];
      for (const s of [...(simple.splits || []), ...(negrisk.splits || [])]) {
        events.push({ type: "SPLIT", user: s.stakeholder?.id, conditionId: s.conditionId, amountUSD: s.amountUSD, timestamp: s.timestamp, txHash: s.txHash });
      }
      for (const m of [...(simple.merges || []), ...(negrisk.merges || [])]) {
        events.push({ type: "MERGE", user: m.stakeholder?.id, conditionId: m.conditionId, amountUSD: m.amountUSD, timestamp: m.timestamp, txHash: m.txHash });
      }
      for (const r of [...(simple.redemptions || []), ...(negrisk.redemptions || [])]) {
        events.push({ type: "REDEMPTION", user: r.redeemer?.id, conditionId: r.conditionId, amountUSD: r.payoutUSD, timestamp: r.timestamp, txHash: r.txHash });
      }

      events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      const top = events.slice(0, first);

      // Hydrate names
      const cids = [...new Set(top.map((e) => e.conditionId).filter(Boolean))];
      const names = new Map<string, string>();
      await Promise.all(cids.map(async (id) => names.set(id, await hydrateName(id))));
      const enriched = top.map((e) => ({
        ...e,
        marketName: names.get(e.conditionId) || e.conditionId,
      }));

      return textResult({ eventCount: enriched.length, events: enriched });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 14: get_recent_activity
// ---------------------------------------------------------------------------
server.registerTool(
  "get_recent_activity",
  {
    description:
      "Get a unified feed of all recent on-chain activity: trades, splits, merges, and redemptions across both market types with market names.",
    inputSchema: {
      first: z.number().default(30),
    },
  },
  async ({ first }) => {
    try {
      const activityQuery = `{
        trades(first: ${first}, orderBy: timestamp, orderDirection: desc) {
          id market { id } type maker taker amountUSD price timestamp txHash
        }
        splits(first: ${first}, orderBy: timestamp, orderDirection: desc) {
          id stakeholder { id } conditionId amountUSD timestamp txHash
        }
        merges(first: ${first}, orderBy: timestamp, orderDirection: desc) {
          id stakeholder { id } conditionId amountUSD timestamp txHash
        }
        redemptions(first: ${first}, orderBy: timestamp, orderDirection: desc) {
          id redeemer { id } conditionId payoutUSD timestamp txHash
        }
      }`;

      const { simple, negrisk } = await queryBoth(activityQuery, activityQuery);

      const events: any[] = [];
      for (const src of [simple, negrisk]) {
        for (const t of src.trades || []) {
          events.push({
            type: "TRADE",
            subType: t.type,
            conditionId: t.market?.id,
            user: t.maker,
            counterparty: t.taker,
            amountUSD: t.amountUSD,
            price: t.price,
            timestamp: t.timestamp,
            txHash: t.txHash,
          });
        }
        for (const s of src.splits || []) {
          events.push({ type: "SPLIT", conditionId: s.conditionId, user: s.stakeholder?.id, amountUSD: s.amountUSD, timestamp: s.timestamp, txHash: s.txHash });
        }
        for (const m of src.merges || []) {
          events.push({ type: "MERGE", conditionId: m.conditionId, user: m.stakeholder?.id, amountUSD: m.amountUSD, timestamp: m.timestamp, txHash: m.txHash });
        }
        for (const r of src.redemptions || []) {
          events.push({ type: "REDEMPTION", conditionId: r.conditionId, user: r.redeemer?.id, amountUSD: r.payoutUSD, timestamp: r.timestamp, txHash: r.txHash });
        }
      }

      events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      const top = events.slice(0, first);

      const cids = [...new Set(top.map((e) => e.conditionId).filter(Boolean))];
      const names = new Map<string, string>();
      await Promise.all(cids.map(async (id) => names.set(id, await hydrateName(id))));
      const enriched = top.map((e) => ({
        ...e,
        marketName: names.get(e.conditionId) || e.conditionId,
      }));

      return textResult({ count: enriched.length, activity: enriched });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 15: get_market_lifecycle
// ---------------------------------------------------------------------------
server.registerTool(
  "get_market_lifecycle",
  {
    description:
      "Get the complete lifecycle of a market: creation, trading stats, splits/merges, resolution status, and redemptions — all from on-chain data with metadata.",
    inputSchema: {
      conditionId: z.string().describe("Market conditionId"),
    },
  },
  async ({ conditionId }) => {
    try {
      const lifecycleQuery = (marketEntity: string) => `{
        ${marketEntity}(id: "${conditionId}") {
          id venue tradesCount buysCount sellsCount
          volumeUSD buyVolumeUSD sellVolumeUSD feesUSD createdAt createdTx
        }
        condition(id: "${conditionId}") {
          id oracle questionId outcomeSlotCount resolved
          payoutNumerators resolvedAt resolvedTx createdAt
        }
        splits(where: { conditionId: "${conditionId}" }, first: 100, orderBy: timestamp) {
          id stakeholder { id } amount amountUSD timestamp
        }
        merges(where: { conditionId: "${conditionId}" }, first: 100, orderBy: timestamp) {
          id stakeholder { id } amount amountUSD timestamp
        }
        redemptions(where: { conditionId: "${conditionId}" }, first: 100, orderBy: timestamp) {
          id redeemer { id } payout payoutUSD timestamp
        }
      }`;

      const [simpleData, negriskData, meta] = await Promise.all([
        querySimple(lifecycleQuery("market")).catch(() => ({})),
        queryNegRisk(lifecycleQuery("negRiskMarket")).catch(() => ({})),
        getMarketMeta(conditionId),
      ]);

      const market = (simpleData as any).market || (negriskData as any).negRiskMarket;
      const condition = (simpleData as any).condition || (negriskData as any).condition;
      const splits = [...((simpleData as any).splits || []), ...((negriskData as any).splits || [])];
      const merges = [...((simpleData as any).merges || []), ...((negriskData as any).merges || [])];
      const redemptions = [...((simpleData as any).redemptions || []), ...((negriskData as any).redemptions || [])];

      const totalSplitUSD = splits.reduce((a: number, s: any) => a + parseFloat(s.amountUSD || "0"), 0);
      const totalMergeUSD = merges.reduce((a: number, m: any) => a + parseFloat(m.amountUSD || "0"), 0);
      const totalRedemptionUSD = redemptions.reduce((a: number, r: any) => a + parseFloat(r.payoutUSD || "0"), 0);

      return textResult({
        title: meta?.title || "Unknown",
        description: meta?.description || "",
        categories: meta?.categories || [],
        expirationDate: meta?.expirationDate || "",
        currentPrices: meta?.prices || [],
        marketType: (simpleData as any).market ? "simple" : "negrisk",
        creation: {
          createdAt: market?.createdAt || condition?.createdAt,
          createdTx: market?.createdTx,
        },
        trading: market || null,
        condition: condition || null,
        liquidity: {
          splitsCount: splits.length,
          totalSplitUSD,
          mergesCount: merges.length,
          totalMergeUSD,
          redemptionsCount: redemptions.length,
          totalRedemptionUSD,
        },
        resolved: condition?.resolved || false,
        resolution: condition?.resolved
          ? {
              payoutNumerators: condition.payoutNumerators,
              resolvedAt: condition.resolvedAt,
              resolvedTx: condition.resolvedTx,
            }
          : null,
      });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 16: get_conditions
// ---------------------------------------------------------------------------
server.registerTool(
  "get_conditions",
  {
    description:
      "Get conditions (markets that have been prepared on-chain) with resolution status. Useful for finding resolved/unresolved markets.",
    inputSchema: {
      resolved: z.boolean().optional().describe("Filter by resolution status"),
      first: z.number().default(20),
    },
  },
  async ({ resolved, first }) => {
    try {
      const resolvedFilter = resolved !== undefined ? `resolved: ${resolved}` : "";
      const condQuery = `{
        conditions(
          first: ${first}
          orderBy: createdAt
          orderDirection: desc
          ${resolvedFilter ? `where: { ${resolvedFilter} }` : ""}
        ) {
          id oracle questionId outcomeSlotCount resolved
          payoutNumerators createdAt resolvedAt
        }
      }`;

      const { simple, negrisk } = await queryBoth(condQuery, condQuery);

      // Deduplicate by id (same CTF contract, same conditions in both)
      const seen = new Set<string>();
      const conditions: any[] = [];
      for (const c of [...(simple.conditions || []), ...(negrisk.conditions || [])]) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          conditions.push(c);
        }
      }

      conditions.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      const top = conditions.slice(0, first);

      // Hydrate names
      const names = new Map<string, string>();
      await Promise.all(top.map(async (c: any) => names.set(c.id, await hydrateName(c.id))));
      const enriched = top.map((c: any) => ({ ...c, title: names.get(c.id) }));

      return textResult({ count: enriched.length, conditions: enriched });
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 17: get_subgraph_schema
// ---------------------------------------------------------------------------
server.registerTool(
  "get_subgraph_schema",
  {
    description:
      "Get the GraphQL schema for a Limitless subgraph via introspection.",
    inputSchema: {
      subgraph: z
        .enum(["simple", "negrisk"])
        .describe("Which subgraph to introspect"),
    },
  },
  async ({ subgraph }) => {
    try {
      const introspectionQuery = `{
        __schema {
          types {
            name kind
            fields { name type { name kind ofType { name kind } } }
          }
        }
      }`;
      const data =
        subgraph === "simple"
          ? await querySimple(introspectionQuery)
          : await queryNegRisk(introspectionQuery);
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 18: query_subgraph
// ---------------------------------------------------------------------------
server.registerTool(
  "query_subgraph",
  {
    description:
      "Run a raw GraphQL query against a Limitless subgraph. Escape hatch for custom queries.",
    inputSchema: {
      subgraph: z.enum(["simple", "negrisk"]).describe("Which subgraph"),
      query: z.string().describe("GraphQL query string"),
    },
  },
  async ({ subgraph, query }) => {
    try {
      const data =
        subgraph === "simple"
          ? await querySimple(query)
          : await queryNegRisk(query);
      return textResult(data);
    } catch (e) {
      return errorResult(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Limitless MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
