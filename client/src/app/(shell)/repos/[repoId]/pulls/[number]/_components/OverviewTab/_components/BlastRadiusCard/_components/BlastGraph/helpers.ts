import type { DownstreamImpact } from "@devdigest/shared";

const COL_X = [0, 260, 520] as const;
const NODE_HEIGHT = 28;
const NODE_GAP = 12;
const ROW = NODE_HEIGHT + NODE_GAP;

export interface GraphNode {
  id: string;
  col: 0 | 1 | 2;
  label: string;
  title?: string;
  kind: "symbol" | "caller" | "endpoint" | "cron";
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height: number;
}

/**
 * Pure layout: column 0 = changed symbols, column 1 = unique callers
 * (by file+name), column 2 = unique endpoints/crons. Edges are symbol→caller
 * and (symbol's callers)→(symbol's endpoints/crons) — see the ponytail note
 * on BlastGraph.tsx for why the second kind is symbol-scoped, not per-caller.
 */
export function layoutGraph(downstream: DownstreamImpact[]): GraphLayout {
  const symbolNodes: GraphNode[] = downstream.map((d, i) => ({
    id: `sym:${d.symbol}`,
    col: 0,
    label: `${d.symbol}()`,
    kind: "symbol",
    x: COL_X[0],
    y: i * ROW,
  }));

  const callerIndex = new Map<string, number>();
  const callerNodes: GraphNode[] = [];
  const endpointIndex = new Map<string, number>();
  const endpointNodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const d of downstream) {
    for (const c of d.callers) {
      const key = `${c.file}|${c.name}`;
      let idx = callerIndex.get(key);
      if (idx === undefined) {
        idx = callerNodes.length;
        callerIndex.set(key, idx);
        callerNodes.push({
          id: `caller:${key}`,
          col: 1,
          label: c.name,
          title: `${c.file}:${c.line}`,
          kind: "caller",
          x: COL_X[1],
          y: idx * ROW,
        });
      }
      edges.push({ from: `sym:${d.symbol}`, to: `caller:${key}` });
    }

    const targets = [
      ...d.endpoints_affected.map((e) => ({ key: `ep:${e}`, label: e, kind: "endpoint" as const })),
      ...d.crons_affected.map((c) => ({ key: `cron:${c}`, label: c, kind: "cron" as const })),
    ];
    for (const target of targets) {
      let idx = endpointIndex.get(target.key);
      if (idx === undefined) {
        idx = endpointNodes.length;
        endpointIndex.set(target.key, idx);
        endpointNodes.push({
          id: target.key,
          col: 2,
          label: target.label,
          kind: target.kind,
          x: COL_X[2],
          y: idx * ROW,
        });
      }
      // ponytail: endpoints are known per symbol, not per caller, so
      // caller→endpoint edges are symbol-scoped; add endpoints to
      // BlastCaller if exact per-caller edges matter.
      for (const c of d.callers) {
        edges.push({ from: `caller:${c.file}|${c.name}`, to: target.key });
      }
    }
  }

  const nodes = [...symbolNodes, ...callerNodes, ...endpointNodes];
  const maxRows = Math.max(symbolNodes.length, callerNodes.length, endpointNodes.length, 1);
  return { nodes, edges, height: maxRows * ROW };
}
