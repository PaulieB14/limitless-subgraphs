// The Graph gateway key. Every tool here reads a subgraph, so nothing works
// without one — but this deliberately does NOT exit the process.
//
// It used to call process.exit(1) at module load. That is the wrong failure for
// an MCP server: the client launches it, the process dies before it can answer
// `initialize`, and the user sees "server failed to start" or an empty tool list
// with no reason. The message went to stderr, which most MCP clients do not
// surface. Starting normally and failing the CALL puts the explanation — and the
// link to fix it — in front of the person who can act on it.
const GRAPH_API_KEY = process.env.GRAPH_API_KEY || "";

export const HAS_GRAPH_API_KEY = GRAPH_API_KEY.length > 0;

export const MISSING_KEY_MESSAGE =
  "GRAPH_API_KEY is not set. Every tool in this server reads a Limitless subgraph " +
  "through The Graph's decentralized gateway, which requires a key. Get a free one at " +
  "https://thegraph.market/dashboard#api-keys and set GRAPH_API_KEY in the MCP server's " +
  "environment (in Claude Desktop/Code, the `env` block of its mcpServers entry).";

if (!HAS_GRAPH_API_KEY) {
  // Still log it: useful when running the binary directly.
  console.error(`⚠️  ${MISSING_KEY_MESSAGE}`);
}

// Decentralized network subgraph IDs — update these after publishing
const SIMPLE_SUBGRAPH_ID = process.env.SIMPLE_SUBGRAPH_ID || "BLkZxK4Zn8FnrfQdNbZ5Vim98hNy2efq2z7QVnse8VrB";
const NEGRISK_SUBGRAPH_ID = process.env.NEGRISK_SUBGRAPH_ID || "31kSDNXGgs55Q53kowpywth5gEU9UVZhjQYyMtHd39er";

const GATEWAY_BASE = `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id`;

export const SIMPLE_ENDPOINT = `${GATEWAY_BASE}/${SIMPLE_SUBGRAPH_ID}`;
export const NEGRISK_ENDPOINT = NEGRISK_SUBGRAPH_ID
  ? `${GATEWAY_BASE}/${NEGRISK_SUBGRAPH_ID}`
  : "";

export const LIMITLESS_API_BASE = "https://api.limitless.exchange";
