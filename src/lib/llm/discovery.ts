/**
 * Finds OpenAI-compatible servers already running on this machine.
 *
 * Browsers cannot scan ports, so this probes the handful of well-known local
 * endpoints with a short timeout. Any server that answers `/models` with a JSON
 * list is reported; everything else is silently ignored.
 */

export interface DiscoveredServer {
  /** Base URL including the API path, e.g. http://localhost:1234/v1 */
  baseUrl: string;
  /** Human label for the kind of server, e.g. LM Studio */
  label: string;
  /** Model ids the server advertises (empty when it has none loaded) */
  models: string[];
}

/** Well-known local endpoints, in the order a user is most likely to run them. */
export const LOCAL_SERVER_CANDIDATES: Omit<DiscoveredServer, 'models'>[] = [
  { baseUrl: 'http://localhost:1234/v1', label: 'LM Studio' },
  { baseUrl: 'http://localhost:8080/v1', label: 'llama.cpp' },
  { baseUrl: 'http://localhost:11434/v1', label: 'Ollama' },
  { baseUrl: 'http://localhost:8000/v1', label: 'vLLM' },
];

const PROBE_TIMEOUT_MS = 1200;

function extractModelIds(json: any): string[] {
  const items = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  return items
    .map((item: any) => (typeof item === 'string' ? item : item?.id))
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
}

async function probe(candidate: Omit<DiscoveredServer, 'models'>): Promise<DiscoveredServer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${candidate.baseUrl}/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    // A reachable server with no models loaded is still useful: it tells the
    // user their server is up and only needs a model.
    let models: string[] = [];
    try {
      models = extractModelIds(await res.json());
    } catch {
      models = [];
    }

    return { ...candidate, models };
  } catch {
    // Connection refused, CORS blocked, or timed out.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes every candidate in parallel and returns the servers that answered.
 * An empty array means nothing was found (or CORS blocked every answer).
 */
export async function discoverLocalServers(
  candidates: Omit<DiscoveredServer, 'models'>[] = LOCAL_SERVER_CANDIDATES
): Promise<DiscoveredServer[]> {
  const results = await Promise.all(candidates.map(probe));
  return results.filter((server): server is DiscoveredServer => server !== null);
}
