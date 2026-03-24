# graph-limitless-mcp

Query Limitless prediction markets on Base — live market data, trader analytics, positions, trades, and daily volume via The Graph's decentralized network.

## Install

```bash
GRAPH_API_KEY=your-key npx graph-limitless-mcp
```

Get a free API key at [thegraph.market/dashboard#api-keys](https://thegraph.market/dashboard#api-keys).

## Tools

| Tool | What it does |
|------|-------------|
| `get_platform_stats` | Total markets, volume, trades, users across Simple + NegRisk |
| `get_markets` | Browse markets with volume, trade counts, resolution status |
| `search_markets` | Search by keyword or category via Limitless API |
| `get_market_details` | Deep dive — conditions, outcomes, payouts |
| `get_trades` | Recent trades with USD amounts, buy/sell, maker/taker |
| `get_user_stats` | Trader profile — volume, trade count, first/last trade |
| `get_user_trades` | Full trade history for any wallet |
| `get_user_positions` | Current holdings with token balances |
| `get_daily_snapshots` | Daily volume, trades, splits, merges, redemptions |
| `get_market_daily_snapshots` | Per-market daily breakdown |
| `get_top_traders` | Leaderboard by volume |
| `get_whale_trades` | Large trades filtered by minimum USD amount |

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
