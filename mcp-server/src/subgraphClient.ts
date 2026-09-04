import {
  SIMPLE_ENDPOINT,
  NEGRISK_ENDPOINT,
  HAS_GRAPH_API_KEY,
  MISSING_KEY_MESSAGE,
} from "./config.js";

/** Per-attempt network timeout. The gateway is usually fast; a hung socket is not. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Extra attempts after the first. Gateway indexer failures are routinely transient. */
const MAX_RETRIES = 2;

/**
 * True for gateway failures that are worth trying again.
 *
 * The Graph's gateway routes each query to indexers and reports their failures
 * back verbatim — e.g. `bad indexers: {0x3b9b…: Timeout, 0xbdfb…: Timeout}`.
 * That is a transient routing problem, not a bad query: the same request
 * usually succeeds moments later against a different indexer. Without a retry
 * one such hiccup surfaced to the caller as a hard tool failure, which is what
 * this exists to stop.
 */
function isRetryable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("bad indexers") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("no indexers") ||
    m.includes("service unavailable") ||
    m.includes("bad gateway") ||
    m.includes("too many requests") ||
    m.includes("fetch failed") ||
    m.includes("econnreset")
  );
}

/** Turn a raw gateway error into something a caller can act on. */
function friendly(message: string): string {
  if (message.toLowerCase().includes("bad indexers")) {
    return (
      "The Graph gateway could not get an answer from any indexer serving this subgraph " +
      `(it reported: ${message.slice(0, 200)}). This is usually transient — retry shortly. ` +
      "If it persists the subgraph may be unsynced or unallocated."
    );
  }
  if (message.includes("401") || message.includes("403")) {
    return `The Graph gateway rejected the API key (${message.slice(0, 120)}). Check GRAPH_API_KEY is valid and has quota.`;
  }
  if (message.includes("429")) {
    return "Rate limited by The Graph gateway. Wait a moment, or raise the key's rate limit at https://thegraph.market/dashboard.";
  }
  return message;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function querySubgraph(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<any> {
  // Checked here rather than at import time so the server still starts, lists
  // its tools, and can explain itself. See config.ts.
  if (!HAS_GRAPH_API_KEY) {
    throw new Error(MISSING_KEY_MESSAGE);
  }
  if (!endpoint) {
    throw new Error("No subgraph endpoint configured for this query.");
  }

  const body: Record<string, unknown> = { query };
  if (variables && Object.keys(variables).length > 0) {
    body.variables = variables;
  }

  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Short exponential backoff: 400ms, 800ms. Long enough for the gateway to
      // pick a different indexer, short enough not to stall an agent's turn.
      await sleep(400 * 2 ** (attempt - 1));
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        lastError = `Subgraph returned HTTP ${response.status}: ${response.statusText}`;
        if (isRetryable(lastError) || response.status >= 500 || response.status === 429) continue;
        throw new Error(friendly(lastError));
      }

      const json = (await response.json()) as { data?: any; errors?: any[] };

      if (json.errors && json.errors.length > 0) {
        lastError = `GraphQL errors: ${JSON.stringify(json.errors)}`;
        if (isRetryable(lastError)) continue;
        throw new Error(friendly(lastError));
      }

      // A 200 carrying neither data nor errors is not a valid GraphQL reply.
      if (json.data === undefined) {
        lastError = "Subgraph returned no data and no errors.";
        continue;
      }

      return json.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // An abort is our own timeout firing; treat it as retryable.
      if (message.includes("abort")) {
        lastError = `Request timed out after ${REQUEST_TIMEOUT_MS}ms`;
        continue;
      }
      // Anything already made friendly above is final — rethrow as-is.
      if (!isRetryable(message)) throw err;
      lastError = message;
    }
  }
  throw new Error(
    `${friendly(lastError)} (failed after ${MAX_RETRIES + 1} attempts)`
  );
}

export async function querySimple(query: string, variables?: Record<string, unknown>) {
  return querySubgraph(SIMPLE_ENDPOINT, query, variables);
}

export async function queryNegRisk(query: string, variables?: Record<string, unknown>) {
  return querySubgraph(NEGRISK_ENDPOINT, query, variables);
}

export async function queryBoth(
  simpleQuery: string,
  negriskQuery: string,
  variables?: Record<string, unknown>
): Promise<{ simple: any; negrisk: any }> {
  const [simple, negrisk] = await Promise.all([
    querySimple(simpleQuery, variables),
    queryNegRisk(negriskQuery, variables),
  ]);
  return { simple, negrisk };
}
