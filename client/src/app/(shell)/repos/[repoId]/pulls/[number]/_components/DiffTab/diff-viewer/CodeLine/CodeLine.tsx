/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { topSeverity } from "../findings";
import { type Line } from "../helpers";
import { SEVERITY_LINE_LABEL } from "../constants";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { FindingCard } from "../../../FindingCard";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  onFindingAction,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings?: FindingRecord[];
  onFindingAction?: (findingId: string, action: FindingActionKind) => void;
}) {
  const t = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const top = findings && findings.length > 0 ? topSeverity(findings) : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...(top ? { borderLeft: `3px solid ${SEV[top].c}` } : {}) }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {top && (
          <span style={{ fontSize: 11, fontWeight: 600, color: SEV[top].c, paddingRight: 12, flexShrink: 0 }}>
            {t(`smartDiff.${SEVERITY_LINE_LABEL[top]}`)}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {findings && findings.length > 0 && (
        <div style={cs.thread}>
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              defaultExpanded
              onAction={(a) => onFindingAction?.(f.id, a)}
            />
          ))}
        </div>
      )}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
