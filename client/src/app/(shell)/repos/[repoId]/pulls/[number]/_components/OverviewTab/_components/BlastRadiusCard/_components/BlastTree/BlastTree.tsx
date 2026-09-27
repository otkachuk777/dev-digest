"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "../../../../../../_lib/github-urls";
import { s } from "./styles";

export function BlastTree({
  downstream,
  repoFullName,
  headSha,
}: {
  downstream: DownstreamImpact[];
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  // All symbols start expanded — `collapsed` tracks the ones toggled shut.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  function toggle(symbol: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  return (
    <div style={s.group}>
      {downstream.map((d) => {
        const expanded = !collapsed.has(d.symbol);
        const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;
        return (
          <div key={d.symbol}>
            <button
              type="button"
              style={s.header}
              aria-expanded={expanded}
              aria-label={t("toggleSymbol", { symbol: d.symbol })}
              onClick={() => toggle(d.symbol)}
            >
              <Chevron size={14} style={{ color: "var(--text-muted)" }} />
              <Icon.Code size={14} style={{ color: "var(--text-muted)" }} />
              <span style={s.symbolName}>{d.symbol}()</span>
              <span style={s.count}>{t("callerCount", { count: d.callers.length })}</span>
            </button>

            {expanded && (
              <div style={s.callers}>
                {d.callers.map((c) => (
                  <div key={`${c.file}:${c.line}`} style={s.callerRow}>
                    <Icon.CornerDownRight size={12} style={{ color: "var(--text-muted)" }} />
                    {repoFullName ? (
                      <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>
                        {c.file}:{c.line}
                      </MonoLink>
                    ) : (
                      <span className="mono">
                        {c.file}:{c.line}
                      </span>
                    )}
                  </div>
                ))}
                {(d.endpoints_affected.length > 0 || d.crons_affected.length > 0) && (
                  <div style={s.badgeRow}>
                    {d.endpoints_affected.map((e) => (
                      <Badge key={e} icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)" mono>
                        {e}
                      </Badge>
                    ))}
                    {d.crons_affected.map((c) => (
                      <Badge key={c} icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono>
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
