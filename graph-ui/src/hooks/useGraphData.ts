import { useCallback, useState } from "react";
import type { GraphData, GraphEdge, GraphNode } from "../lib/types";

export interface LoadProgress {
  receivedBytes: number;
  totalBytes: number | null;
}

interface UseGraphDataResult {
  data: GraphData | null;
  loading: boolean;
  error: string | null;
  progress: LoadProgress;
  fetchOverview: (
    project: string,
    maxNodes?: number,
    graph?: "code" | "missed",
    pathFilters?: string[],
  ) => void;
  fetchDetail: (project: string, centerNode: string) => void;
}

/* Node budget: how many nodes the layout endpoint is asked for. The default
 * keeps first paint fast; the user can raise it in 5k steps up to the hard
 * ceiling (mirrors HARD_MAX_NODES in src/ui/layout3d.c). Edges always follow
 * the budget — the server returns every edge between the loaded nodes. */
export const GRAPH_RENDER_NODE_LIMIT = 5000;
export const GRAPH_NODE_BUDGET_STEP = 5000;
export const GRAPH_NODE_BUDGET_MAX = 10_000_000;

export function clampNodeBudget(value: number): number {
  if (!Number.isFinite(value)) return GRAPH_RENDER_NODE_LIMIT;
  const stepped =
    Math.round(value / GRAPH_NODE_BUDGET_STEP) * GRAPH_NODE_BUDGET_STEP;
  if (stepped < GRAPH_NODE_BUDGET_STEP) return GRAPH_NODE_BUDGET_STEP;
  if (stepped > GRAPH_NODE_BUDGET_MAX) return GRAPH_NODE_BUDGET_MAX;
  return stepped;
}

/** Which graph to lay out: the code graph (default) or the missed graph —
 *  only files the indexer could not fully cover, as their file structure. */
export type GraphVariant = "code" | "missed";

export async function fetchLayout(
  project: string,
  maxNodes = GRAPH_RENDER_NODE_LIMIT,
  onProgress?: (progress: LoadProgress) => void,
  graph: GraphVariant = "code",
  pathFilter?: string,
): Promise<GraphData> {
  const params = new URLSearchParams({ project, max_nodes: String(maxNodes) });
  if (graph === "missed") params.set("graph", "missed");
  if (pathFilter) params.set("path", pathFilter);
  const res = await fetch(`/api/layout?${params}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  /* Stream the body when possible so large budgets show live download
   * progress instead of a silent stall. */
  if (!res.body || !onProgress) {
    return res.json();
  }

  const lengthHeader = res.headers.get("content-length");
  const totalBytes = lengthHeader ? parseInt(lengthHeader, 10) || null : null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.length;
    onProgress({ receivedBytes, totalBytes });
  }

  const merged = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(merged));
}

/* The backend's ?path= only takes one glob, so a multi-folder selection
 * fans out to one request per folder and merges the results client-side —
 * no server change needed. Nodes/edges that show up in more than one
 * folder's response (e.g. a shared boundary edge) are deduped. missed_graph
 * and linked_projects are taken from the first response only; combining
 * those across folders isn't needed for path-scoping the main graph. */
function mergeGraphData(results: GraphData[]): GraphData {
  const nodeById = new Map<number, GraphNode>();
  const edgeKey = (e: GraphEdge) => `${e.source}\0${e.target}\0${e.type}`;
  const edges = new Map<string, GraphEdge>();
  for (const r of results) {
    for (const n of r.nodes) nodeById.set(n.id, n);
    for (const e of r.edges) edges.set(edgeKey(e), e);
  }
  const nodes = [...nodeById.values()];
  return {
    nodes,
    edges: [...edges.values()],
    total_nodes: nodes.length,
    missed_graph: results[0]?.missed_graph,
    linked_projects: results[0]?.linked_projects,
  };
}

const NO_PROGRESS: LoadProgress = { receivedBytes: 0, totalBytes: null };

export function useGraphData(): UseGraphDataResult {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LoadProgress>(NO_PROGRESS);

  const fetchOverview = useCallback(
    async (
      project: string,
      maxNodes?: number,
      graph: GraphVariant = "code",
      pathFilters?: string[],
    ) => {
      setLoading(true);
      setError(null);
      setProgress(NO_PROGRESS);
      try {
        if (pathFilters && pathFilters.length > 1) {
          /* Progress reporting doesn't compose cleanly across N parallel
           * streamed fetches, so multi-path loads skip the live byte
           * counter — each folder is small by construction anyway. */
          const results = await Promise.all(
            pathFilters.map((p) => fetchLayout(project, maxNodes, undefined, graph, p)),
          );
          setData(mergeGraphData(results));
        } else {
          const result = await fetchLayout(project, maxNodes, setProgress, graph, pathFilters?.[0]);
          setData(result);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch layout");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchDetail = useCallback(
    async (project: string, _centerNode: string) => {
      setLoading(true);
      setError(null);
      setProgress(NO_PROGRESS);
      try {
        /* TODO: detail level with center_node filtering */
        const result = await fetchLayout(project, undefined, setProgress);
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch layout");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { data, loading, error, progress, fetchOverview, fetchDetail };
}
