# Limitless Subgraphs + MCP Server

Subgraphs and MCP server for [Limitless Exchange](https://limitless.exchange) prediction markets on Base.

## Subgraphs

Two subgraphs indexing different exchange venues on the same CTF (Conditional Tokens Framework):

| Subgraph | Studio Name | What it indexes |
|---|---|---|
| `simple-markets` | `limitless-simple-markets` | Binary Yes/No markets — CTF Exchange v1/v2/v3 |
| `negrisk-markets` | `limitless-negrisk-markets` | Multi-outcome category markets — NegRisk Exchange v1/v2/v3 |

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

### Best Practices Applied

1. Immutable entities for event data (faster indexing)
2. `Bytes` as IDs (faster queries)
3. `concatI32()` / `concat()` for ID generation
4. `@derivedFrom` for reverse lookups (no extra storage)
5. No `eth_calls` in mappings (pure event-driven)
6. Pruning enabled via `indexerHints`
7. Correct `startBlock` per contract (no wasted indexing)

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

### Build & Deploy

```bash
# Simple markets
cd packages/simple-markets
npm install
npx graph codegen && npx graph build
npx graph deploy limitless-simple-markets --product subgraph-studio --version-label v0.0.2

# NegRisk markets
cd packages/negrisk-markets
npm install
npx graph codegen && npx graph build
npx graph deploy limitless-negrisk-markets --product subgraph-studio --version-label v0.0.3
```

### Query Endpoints

```
Simple:  https://api.studio.thegraph.com/query/1717345/limitless-simple-markets/version/latest
NegRisk: https://api.studio.thegraph.com/query/1717345/limitless-negrisk-markets/version/latest
```

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

An MCP server that combines both subgraphs with the [Limitless REST API](https://api.limitless.exchange) for market names and metadata. Every tool queries the subgraphs for on-chain data.

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
        "LIMITLESS_API_KEY": "lmts_your_key_here"
      }
    }
  }
}
```

The API key is optional — market browsing and search work without it. Add one for authenticated endpoints.
