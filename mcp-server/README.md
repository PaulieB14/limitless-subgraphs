# graph-limitless-mcp

Query Limitless prediction markets on Base — live market data, trader analytics, positions, trades, and daily volume via The Graph's decentralized network.

## Install

```bash
GRAPH_API_KEY=your-key npx graph-limitless-mcp
```

Get a free API key at [thegraph.market/dashboard#api-keys](https://thegraph.market/dashboard#api-keys).

## Tools

19 tools, all read-only.

### Protocol-wide

| Tool | What it does |
|------|-------------|
| `get_global_stats` | Get combined protocol-wide stats across both simple and negrisk markets. |
| `get_daily_protocol_stats` | Get daily protocol stats (volume, trades, fees, splits, merges, redemptions) across both market types as a time series. |
| `compare_market_types` | Side-by-side comparison of simple vs negrisk market performance. |
| `get_recent_activity` | Get a unified feed of all recent on-chain activity: trades, splits, merges, and redemptions across both market types with market names. |
| `get_liquidity_events` | Get splits, merges, and redemptions — the liquidity lifecycle events. |
| `get_conditions` | Get conditions (markets that have been prepared on-chain) with resolution status. |

### Markets

| Tool | What it does |
|------|-------------|
| `search_markets` | Search markets by keyword or category. |
| `get_market_analytics` | Get full analytics for a specific market by conditionId. |
| `get_market_trades` | Get trades for a specific market. |
| `get_market_positions` | Get top position holders for a specific market. |
| `get_market_daily_snapshots` | Get daily volume, trades, and fees for a specific market over time. |
| `get_market_lifecycle` | Get the complete lifecycle of a market: creation, trading stats, splits/merges, resolution status, and redemptions — all from on-chain data with metad |

### Traders

| Tool | What it does |
|------|-------------|
| `get_trader_profile` | Get a trader's profile across both simple and negrisk markets. |
| `get_trader_trades` | Get a trader's recent trades across both market types, enriched with market names. |
| `get_trader_positions` | Get a trader's current positions across both market types with balances and PnL. |
| `get_trader_pnl` | Calculate a trader's estimated profit & loss from on-chain data. |
| `get_top_traders` | Get top traders ranked by volume, trade count, or PnL. |

### Escape hatches

| Tool | What it does |
|------|-------------|
| `get_subgraph_schema` | Get the GraphQL schema for a Limitless subgraph via introspection. |
| `query_subgraph` | Run a raw GraphQL query against a Limitless subgraph. |

## How this differs from the official Limitless MCP

Limitless runs its own remote MCP at `https://api.limitless.exchange/mcp`. The two do
different jobs and are worth having side by side:

| | Official Limitless MCP | This server |
|---|---|---|
| Source | Limitless API (authenticated) | Limitless subgraphs on The Graph |
| Auth | OAuth sign-in to your Limitless account | a free Graph gateway key, no account |
| Reads | live orderbooks, your positions, your orders | on-chain history for the whole protocol |
| Writes | proposes orders for you to approve in a browser | nothing, read-only |
| Best for | trading, and your own account | analytics across all markets and traders |

Use theirs to see the book and place an order. Use this one to ask questions the API
does not answer: protocol-wide volume over time, who the largest traders are, a given
address's realised PnL, how simple markets compare with NegRisk, or an arbitrary
GraphQL query against the raw subgraph.

## Data

- **Simple Markets**: 8,000+ markets, 3.9M trades, $317M volume
- **NegRisk Markets**: 700+ multi-outcome prediction markets
- **Network**: Base L2
- **Source**: The Graph decentralized network

## Claude Desktop config

```json
{
  "mcpServers": {
    "limitless": {
      "command": "npx",
      "args": ["graph-limitless-mcp"],
      "env": {
        "GRAPH_API_KEY": "your-key"
      }
    }
  }
}
```

## Links

- [GitHub](https://github.com/PaulieB14/limitless-subgraphs)
- [Limitless](https://limitless.exchange)
- [The Graph](https://thegraph.com)
- [npm](https://www.npmjs.com/package/graph-limitless-mcp)
