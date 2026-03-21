import { SIMPLE_ENDPOINT, NEGRISK_ENDPOINT } from "./config.js";

export async function querySubgraph(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<any> {
  const body: Record<string, unknown> = { query };
  if (variables && Object.keys(variables).length > 0) {
    body.variables = variables;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Subgraph returned HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: any; errors?: any[] };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
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
