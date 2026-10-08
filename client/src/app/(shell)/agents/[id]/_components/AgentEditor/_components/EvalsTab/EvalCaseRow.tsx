import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { resultLine } from "@/lib/eval";
import { row, s, typeTag } from "./styles";

const STATUS = {
  pass: { icon: Icon.CheckCircle, color: "var(--ok)" },
  fail: { icon: Icon.XCircle, color: "var(--crit)" },
  error: { icon: Icon.AlertTriangle, color: "var(--warn)" },
  never: { icon: Icon.Dot, color: "var(--text-muted)" },
} as const;

/** All text here (names, titles, errors) comes from users or the model: rendered as plain text. */
export function EvalCaseRow({
  c,
  running,
  onOpen,
  onRun,
  onDelete,
}: {
  c: EvalCase;
  running: boolean;
  onOpen: () => void;
  onRun: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const [hover, setHover] = React.useState(false);
  const status = c.last_result?.status ?? "never";
  const St = STATUS[status];
  const mustFind = c.expectation_type === "must_find";
  const line = resultLine(c.last_result);
  const first = c.expected[0];
  const chip = !mustFind
    ? t("evals.assertEmpty")
    : first?.severity && first.category
      ? `${first.severity.toUpperCase()} · ${first.category}`
      : first
        ? `${first.file}:${first.start_line}-${first.end_line}`
        : "";
  const text =
    line.kind === "never"
      ? t("evals.result.never")
      : line.kind === "error"
        ? t("evals.result.error", { reason: line.reason })
        : mustFind
          ? t("evals.result.mustFind", { n: line.expected, m: line.got })
          : t("evals.result.mustNotFlag", { m: line.got });
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={row(hover)}>
      <span role="img" aria-label={t(`evals.status.${status}`)} style={{ display: "inline-flex" }}>
        <St.icon size={15} style={{ color: St.color, flexShrink: 0 }} />
      </span>
      <div style={s.rowBody}>
        <div style={s.rowTop}>
          <span className="mono" style={s.name}>
            {c.name}
          </span>
          <span title={c.source_decision ? t("evals.seededFrom", { decision: c.source_decision }) : undefined} style={typeTag(mustFind)}>
            {mustFind ? t("evals.mustFind") : t("evals.mustNotFlag")}
          </span>
        </div>
        <div style={s.result}>{text}</div>
      </div>
      {chip && <Badge color="var(--text-muted)">{chip}</Badge>}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 2, opacity: hover ? 1 : 0.6 }}>
        <IconBtn icon={running ? "RefreshCw" : "Play"} label={t("evals.actions.run", { name: c.name })} size={26} onClick={running ? undefined : onRun} />
        <IconBtn icon="Edit" label={t("evals.actions.edit", { name: c.name })} size={26} onClick={onOpen} />
        <IconBtn icon="Trash" label={t("evals.actions.delete", { name: c.name })} size={26} danger onClick={onDelete} />
      </div>
    </div>
  );
}
