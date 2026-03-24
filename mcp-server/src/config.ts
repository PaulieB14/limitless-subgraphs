const GRAPH_API_KEY = process.env.GRAPH_API_KEY || "";

if (!GRAPH_API_KEY) {
  console.error(
    "⚠️  GRAPH_API_KEY is required. Get a free key at https://thegraph.market/dashboard#api-keys"
  );
  process.exit(1);
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
