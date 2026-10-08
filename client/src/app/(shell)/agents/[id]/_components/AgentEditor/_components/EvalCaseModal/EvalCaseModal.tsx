"use client";

import { useTranslations } from "next-intl";
import { Button, Modal, Toggle } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { ExpectedPanel } from "./ExpectedPanel";
import { InputPanel } from "./InputPanel";
import { s } from "./styles";
import { useEvalCaseForm } from "./useEvalCaseForm";

/** New / edit eval case. `evalCase` null = new. The parent passes the live case so a finished run shows up. */
export function EvalCaseModal({
  agentId,
  agentName,
  evalCase,
  onClose,
}: {
  agentId: string;
  agentName: string;
  evalCase: EvalCase | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const form = useEvalCaseForm(evalCase, agentId, onClose);
  const { st, patch, run, pending, canRun, validJson, seeded, submit } = form;

  const subtitle = seeded && evalCase?.source_decision
    ? t("modal.subtitleSeeded", { decision: t(`modal.decision.${evalCase.source_decision}`) })
    : t("modal.subtitleAgent", { agent: agentName });

  return (
    <Modal
      width={920}
      title={evalCase ? t("modal.title", { name: evalCase.name }) : t("modal.newTitle")}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <label style={s.runOnSave}>
            <Toggle on={st.runOnSave} onChange={(v) => patch({ runOnSave: v })} size={15} />
            {t("modal.runOnSave")}
          </label>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="secondary"
            icon="Play"
            disabled={!canRun || run.isPending}
            loading={run.isPending}
            title={canRun ? undefined : t("modal.saveFirst")}
            onClick={() => evalCase && run.mutate(evalCase.id)}
          >
            {t("modal.runCase")}
          </Button>
          <Button kind="primary" icon="Check" disabled={!validJson || pending} loading={pending} onClick={submit}>
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div style={s.grid}>
        <InputPanel form={form} evalCase={evalCase} />
        <ExpectedPanel form={form} evalCase={evalCase} />
      </div>
    </Modal>
  );
}
