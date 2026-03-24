# Limitless Subgraphs + MCP Server

Subgraphs and MCP server for [Limitless Exchange](https://limitless.exchange) prediction markets on Base.

[![Limitless MCP server](https://glama.ai/mcp/servers/PaulieB14/limitless-subgraphs/badges/card.svg)](https://glama.ai/mcp/servers/PaulieB14/limitless-subgraphs)

## Why Subgraphs?

The [Limitless REST API](https://docs.limitless.exchange/api-reference/introduction) is useful for market metadata (titles, descriptions, categories) but has significant limitations for analytics:

- **Rate limited** — max 2 concurrent requests, 300ms minimum delay between calls, 429s on bursts
- **No historical aggregation** — no way to query total protocol volume, trade counts over time, or cross-market analytics
- **No on-chain depth** — the API doesn't expose individual trade fills, position balances, splits/merges/redemptions, or resolution payouts

Subgraphs solve all of this. They index every on-chain event into a queryable GraphQL API with no rate limits, full historical data, and flexible aggregation. The MCP server combines both — subgraphs for the heavy analytics, REST API for market names and metadata.

### Why market names aren't in the subgraphs

Market titles and descriptions are stored off-chain in the Limitless database — they are not emitted in any on-chain event. Unlike Polymarket, which uses UMA's `QuestionInitialized` event to embed question text in `ancillaryData` on-chain, Limitless uses a GnosisSafe multisig as the oracle address. The multisig calls `prepareCondition` directly on the CTF contract with no accompanying event that carries the question text. The `questionId` in the CTF's `ConditionPreparation` event is a bytes32 hash, not readable text.

This means there is no on-chain source a subgraph can index for market names. The MCP server bridges this gap by joining subgraph data (via `conditionId`) with the Limitless REST API for titles and metadata.

## Subgraphs

Two subgraphs indexing different exchange venues on the same CTF (Conditional Tokens Framework):

| Subgraph | What it indexes |
|---|---|
| `limitless-simple-markets` | Binary Yes/No markets — CTF Exchange v1/v2/v3 |
| `limitless-negrisk-markets` | Multi-outcome category markets — NegRisk Exchange v1/v2/v3 |

Both share the same CTF contract (`0xC9c9...`) for conditions, positions, splits, merges, and redemptions. Each indexes its own set of exchange contracts for markets and trades.

### Entities

- **Condition** — prepared markets with oracle, resolution status, payouts
- **Market / NegRiskMarket** — exchange-registered markets with volume, trade counts, fees
- **Trade** (immutable) — individual order fills with maker/taker, price, USD amounts
- **UserPosition** — per-user token balances and PnL
- **Split / Merge / Redemption** (immutable) — CTF liquidity events
- **User** — aggregated trader stats
- **MarketDailySnapshot / GlobalDailySnapshot** — daily time series
- **GlobalStats** — protocol-wide singleton

### Contracts

**Simple Markets:**
| Contract | Address | Start Block |
|---|---|---|
| CTF | `0xC9c98965297Bc527861c898329Ee280632B76e18` | 15,916,136 |
| Exchange V1 | `0xa4409D988CA2218d956BeEFD3874100F444f0DC3` | 26,043,405 |
| Exchange V2 | `0xF1De958F8641448A5ba78c01f434085385Af096D` | 39,507,768 |
| Exchange V3 | `0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5` | 39,598,606 |

**NegRisk Markets:**
| Contract | Address | Start Block |
|---|---|---|
| CTF | `0xC9c98965297Bc527861c898329Ee280632B76e18` | 15,916,136 |
| NegRisk Exchange V1 | `0x5a38afc17F7E97ad8d6C547ddb837E40B4aEDfC6` | 28,018,020 |
| NegRisk Exchange V2 | `0x46e607D3f4a8494B0aB9b304d1463e2F4848891d` | 39,508,390 |
| NegRisk Exchange V3 | `0xe3E00BA3a9888d1DE4834269f62ac008b4BB5C47` | 39,598,827 |

### Example Queries

```graphql
# Global stats
{
  globalStats(id: "0x73696d706c65") {
    totalMarkets resolvedMarkets totalTradesCount
    totalVolumeUSD totalFeesUSD totalUsers
  }
}

# Recent trades with market info
{
  trades(first: 10, orderBy: timestamp, orderDirection: desc) {
    type maker taker amountUSD price venue timestamp
    market { id tradesCount volumeUSD }
  }
}

# User positions
{
  userPositions(where: { user: "0x..." , balance_gt: "0" }) {
    tokenId balance netCostUSD realizedPnlUSD
    condition { id resolved payoutNumerators }
  }
}
```

---

## MCP Server

An MCP server that combines both subgraphs with the [Limitless REST API](https://docs.limitless.exchange/api-reference/introduction) for market names and metadata. Every tool queries the subgraphs for on-chain data.

### Tools (18)

| Tool | Description |
|---|---|
| `get_global_stats` | Combined protocol stats across both market types |
| `get_market_analytics` | Full market detail — on-chain stats + metadata |
| `search_markets` | Keyword/category search with subgraph enrichment |
| `get_market_trades` | Trade feed for a specific market |
| `get_market_daily_snapshots` | Daily volume/trades/fees for a market |
| `get_market_positions` | Top position holders for a market |
| `get_market_lifecycle` | Creation → trading → resolution lifecycle |
| `get_trader_profile` | Trader stats merged across both subgraphs |
| `get_top_traders` | Leaderboard by volume, trades, or fees |
| `get_trader_trades` | Trader's recent trades with market names |
| `get_trader_positions` | Trader's portfolio with balances and PnL |
| `get_daily_protocol_stats` | Daily time series across both market types |
| `compare_market_types` | Simple vs NegRisk side-by-side comparison |
| `get_liquidity_events` | Splits, merges, and redemptions feed |
| `get_recent_activity` | Unified activity feed (trades + liquidity events) |
| `get_conditions` | Browse conditions with resolution status |
| `get_subgraph_schema` | GraphQL schema introspection |
| `query_subgraph` | Raw GraphQL escape hatch |

### Setup

```bash
cd mcp-server
npm install
npm run build
```

### Claude Code Config

```json
{
  "mcpServers": {
    "limitless": {
      "command": "node",
      "args": ["/path/to/limitless-subgraphs/mcp-server/build/index.js"],
      "env": {
        "GRAPH_API_KEY": "your_graph_api_key",
        "LIMITLESS_API_KEY": "lmts_your_key_here"
      }
    }
  }
}
```

### API Keys

- **`GRAPH_API_KEY`** (required) — needed to query the subgraphs via The Graph. Get one at [thegraph.com/studio/apikeys](https://thegraph.com/studio/apikeys/)
- **`LIMITLESS_API_KEY`** (optional) — enables market name/metadata enrichment from the Limitless REST API. Without it, market browsing and search still work (public endpoints). Generate one at [limitless.exchange](https://limitless.exchange) → profile menu → Api keys. Key format: `lmts_...`. Pass via `X-API-Key` header. See the [Limitless API docs](https://docs.limitless.exchange/api-reference/introduction) for full details.

Note: The Limitless REST API is rate limited to 2 concurrent requests with 300ms minimum delay. The subgraphs have no such limits, which is why the MCP routes all analytics queries through them and only uses the REST API for metadata.