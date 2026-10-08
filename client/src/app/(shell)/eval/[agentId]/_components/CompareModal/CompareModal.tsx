"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, SectionLabel } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import { useEvalRun, usePromoteRun } from "@/lib/api/eval";
import { deltaPt, pct } from "@/lib/eval";
import { formatCost } from "@/lib/format";
import { caseSetNote, configDiffLines, isCurrent, orderRuns, wordDiff } from "./helpers";
import { delta, s, swatch } from "./styles";

type Tile = { id: string; label: string; color: string; old: string; now: string; change: { up: boolean; text: string } | null };

/** Compare two suite runs of one agent: metric deltas, system-prompt word diff, config changes, Promote (SPEC-04 US-5). */
export function CompareModal({ agent, ids, onClose }: { agent: Agent; ids: [string, string]; onClose: () => void }) {
  const t = useTranslations("eval.compare");
  const tc = useTranslations("eval.common");
  const first = useEvalRun(ids[0]).data;
  const second = useEvalRun(ids[1]).data;
  const promote = usePromoteRun();
  const [confirming, setConfirming] = React.useState(false);

  if (!first || !second) {
    return (
      <Modal width={960} title={t("loading")} onClose={onClose}>
        <div style={s.message}>{t("loading")}</div>
      </Modal>
    );
  }
  const [a, b] = orderRuns(first, second);
  const sets = caseSetNote(a.results, b.results);
  const lines = configDiffLines(a.config, b.config);
  const diff = wordDiff(a.config.system_prompt, b.config.system_prompt);
  const current = isCurrent(b.config, agent);

  const metric = (id: string, label: string, color: string, o: number | null, n: number | null): Tile => {
    const d = deltaPt(n, o);
    return { id, label, color, old: pct(o), now: pct(n), change: d && d.dir !== "flat" ? { up: d.dir === "up", text: `${d.dir === "up" ? "▲" : "▼"} ${tc("pt", { n: d.n })}` } : null };
  };
  const costDiff = a.cost_usd != null && b.cost_usd != null ? b.cost_usd - a.cost_usd : 0;
  const tiles: Tile[] = [
    metric("recall", t("recall"), "var(--accent)", a.recall, b.recall),
    metric("precision", t("precision"), "var(--ok)", a.precision, b.precision),
    metric("citation", t("citation"), "var(--warn)", a.citation_accuracy, b.citation_accuracy),
    {
      id: "cost", label: t("cost"), color: "var(--text-primary)", old: formatCost(a.cost_usd), now: formatCost(b.cost_usd),
      // AC-64: "$x.xx"; no delta when either side is null or the change rounds to zero.
      change: Math.abs(costDiff) >= 0.005 ? { up: costDiff > 0, text: `${costDiff > 0 ? "▲" : "▼"} $${Math.abs(costDiff).toFixed(2)}` } : null,
    },
  ];

  return (
    <>
      <Modal
        width={960}
        title={t("title", { a: a.agent_version, b: b.agent_version })}
        subtitle={t("subtitle", { n: sets.common })}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("close")}
            </Button>
            <span title={current ? t("currentTip", { v: b.agent_version }) : undefined}>
              <Button kind="primary" icon="GitBranch" disabled={current || promote.isPending} onClick={() => setConfirming(true)}>
                {t("promote", { v: b.agent_version })}
              </Button>
            </span>
          </div>
        }
      >
        <div style={s.body}>
          <div style={s.tiles}>
            {tiles.map((x) => (
              <div key={x.id} style={s.tile}>
                <div style={s.tileLabel}>{x.label}</div>
                <div style={s.tileRow}>
                  <span className="tnum" style={s.oldValue}>{x.old}</span>
                  <Icon.ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
                  <span className="tnum" style={{ ...s.newValue, color: x.color }}>{x.now}</span>
                  {x.change && <span className="tnum" style={delta(x.change.up)}>{x.change.text}</span>}
                </div>
              </div>
            ))}
          </div>
          <SectionLabel icon="FileText">{t("promptDiff")}</SectionLabel>
          <div style={s.legend}>
            <span style={s.legendItem}><span style={swatch("var(--code-del)")} />{t("legendOld", { v: a.agent_version })}</span>
            <span style={s.legendItem}><span style={swatch("var(--code-add)")} />{t("legendNew", { v: b.agent_version })}</span>
          </div>
          {a.config.system_prompt === b.config.system_prompt ? (
            <div style={s.note}>{t("noPromptChange")}</div>
          ) : (
            // Plain text spans only: prompts are user-authored (SPEC-04 security notes).
            <div className="mono" style={s.diff}>
              {diff.map((d, i) =>
                d.op === "add" ? <ins key={i} style={s.add}>{d.text}</ins> : d.op === "del" ? <del key={i} style={s.del}>{d.text}</del> : <span key={i} style={s.same}>{d.text}</span>,
              )}
            </div>
          )}
          {lines.length > 0 && (
            <ul aria-label={t("configChanges")} style={s.config}>
              {lines.map((l) => {
                const text = t(`config.${l.kind}`, l);
                return <li key={text}>{text}</li>;
              })}
            </ul>
          )}
          {(sets.onlyA > 0 || sets.onlyB > 0) && (
            <p style={s.note}>{t("caseSets", { a: sets.onlyA, va: a.agent_version, b: sets.onlyB, vb: b.agent_version })}</p>
          )}
        </div>
      </Modal>
      {confirming && (
        <ConfirmModal
          title={t("confirmTitle", { v: b.agent_version })}
          body={t("confirmBody", { v: b.agent_version })}
          confirmLabel={t("confirm")}
          cancelLabel={t("cancel")}
          busy={promote.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => promote.mutate({ runId: b.id, version: b.agent_version }, { onSuccess: onClose, onSettled: () => setConfirming(false) })}
        />
      )}
    </>
  );
}
