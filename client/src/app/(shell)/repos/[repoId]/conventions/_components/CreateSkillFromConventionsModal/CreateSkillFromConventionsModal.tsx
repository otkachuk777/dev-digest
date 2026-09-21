"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import {
  Badge,
  Button,
  FormField,
  Icon,
  Modal,
  SelectInput,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import { useAgents, useAttachAgentSkill } from "@/lib/api/agents";
import { useCreateSkill } from "@/lib/api/skills";
import { estimateTokens } from "@/lib/tokens";
import { BODY_ROWS, DEFAULT_TYPE, MODAL_WIDTH, SKILL_TYPES } from "./constants";
import { conventionsToDraft } from "./helpers";
import { s } from "./styles";

export interface CreateSkillFromConventionsModalProps {
  /** The ACCEPTED conventions — nothing else may reach the skill body. */
  conventions: ConventionCandidate[];
  repoName: string;
  onClose: () => void;
}

/** Merge the accepted conventions into one editable skill draft, then save it via `POST /skills`. */
export function CreateSkillFromConventionsModal({ conventions, repoName, onClose }: CreateSkillFromConventionsModalProps) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const create = useCreateSkill();
  const attach = useAttachAgentSkill();
  const { data: agents = [] } = useAgents();

  // Computed once: the draft is the STARTING point, everything below is editable.
  const [draft] = React.useState(() => conventionsToDraft(conventions, repoName));
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  const [agentId, setAgentId] = React.useState("");
  const [failed, setFailed] = React.useState(false);

  const busy = create.isPending || attach.isPending;
  const canSubmit = name.trim().length > 0 && body.trim().length > 0 && !busy;

  const submit = async () => {
    setFailed(false);
    try {
      const skill = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || draft.description,
        type,
        body,
        source: "extracted",
        enabled,
      });
      if (agentId) await attach.mutateAsync({ agentId, skillId: skill.id });
      onClose();
      router.push(`/skills/${skill.id}`);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("modal.footer")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canSubmit} loading={busy}>
            {t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <span style={s.bannerIcon}>
            <Icon.Wrench size={15} />
          </span>
          <span>
            {t.rich("modal.banner", {
              count: conventions.length,
              repo: repoName,
              b: (chunks) => <strong>{chunks}</strong>,
              code: (chunks) => (
                <span className="mono" style={s.repo}>
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>

        <FormField label={t("modal.name")} required>
          <TextInput value={name} onChange={setName} mono aria-label={t("modal.name")} />
        </FormField>
        <FormField label={t("modal.description")}>
          <TextInput value={description} onChange={setDescription} aria-label={t("modal.description")} />
        </FormField>

        <div style={s.row}>
          <div style={s.col}>
            <FormField label={t("modal.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={SKILL_TYPES} />
            </FormField>
          </div>
          <div style={s.col}>
            <FormField label={t("modal.enabled")}>
              <div style={s.toggleRow}>
                <Toggle on={enabled} onChange={setEnabled} size={17} />
              </div>
              <div style={s.hint}>{t("modal.enabledHint")}</div>
            </FormField>
          </div>
        </div>

        <FormField label={t("modal.attach")}>
          <SelectInput
            value={agentId}
            onChange={setAgentId}
            mono={false}
            options={[{ value: "", label: t("modal.attachNone") }, ...agents.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <div style={s.hint}>{t("modal.attachHint")}</div>
        </FormField>

        <FormField label={t("modal.body")} hint={t("modal.bodyHint")} required>
          <div style={s.editor}>
            <div style={s.editorHead}>
              <Icon.FileText size={14} />
              <span className="mono" style={s.fileName}>
                {name.trim() || draft.name}.md
              </span>
              <Badge>{t("modal.unsaved")}</Badge>
              <span className="mono" style={s.tokens}>
                {t("modal.tokens", { count: estimateTokens(body) })}
              </span>
            </div>
            <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
          </div>
        </FormField>

        {failed && <div style={s.error}>{t("modal.createFailed")}</div>}
      </div>
    </Modal>
  );
}
