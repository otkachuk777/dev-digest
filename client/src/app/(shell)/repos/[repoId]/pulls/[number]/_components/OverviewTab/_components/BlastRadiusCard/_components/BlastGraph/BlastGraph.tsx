"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { layoutGraph, type GraphNode } from "./helpers";
import { s } from "./styles";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 28;

const STROKE_BY_KIND: Record<GraphNode["kind"], string> = {
  symbol: "var(--accent)",
  caller: "var(--border-strong)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
};

export function BlastGraph({ downstream }: { downstream: DownstreamImpact[] }) {
  const t = useTranslations("blast");

  if (downstream.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("graph.empty")}</div>;
  }

  const { nodes, edges, height } = layoutGraph(downstream);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const viewHeight = Math.max(height, NODE_HEIGHT);
  const viewWidth = 260 * 2 + NODE_WIDTH;

  return (
    <div style={s.wrap}>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width="100%"
        height={viewHeight}
      >
        {edges.map((e, i) => {
          const from = nodeById.get(e.from);
          const to = nodeById.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_HEIGHT / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={`${e.from}->${e.to}:${i}`}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              style={s.edge}
            />
          );
        })}
        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={5}
              style={{ ...s.nodeRect, stroke: STROKE_BY_KIND[n.kind] }}
            >
              {n.title && <title>{n.title}</title>}
            </rect>
            <text x={n.x + 8} y={n.y + NODE_HEIGHT / 2 + 4} style={s.nodeLabel}>
              {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
            </text>
          </g>
        ))}
      </svg>
      <div style={s.legendRow}>
        <span style={s.legendItem}>
          <span style={{ ...s.swatch, borderColor: "var(--accent)" }} />
          {t("legend.changed")}
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.swatch, borderColor: "var(--border-strong)" }} />
          {t("legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.swatch, borderColor: "var(--accent)" }} />
          {t("legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
