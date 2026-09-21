"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import { Button, Icon, MonoLink, ProgressBar, TextInput } from "@devdigest/ui";
import { confidenceColor, confidencePercent, formatEvidenceRange } from "./helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  item: ConventionCandidate;
  onToggleAccepted: (accepted: boolean) => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
}

/** One extracted convention: the rule, the code that proves it, and accept / reject / edit. */
export function ConventionCard({ item, onToggleAccepted, onReject, onSaveRule }: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.rule);

  const startEdit = () => {
    setDraft(item.rule);
    setEditing(true);
  };
  const save = () => {
    const rule = draft.trim();
    if (rule && rule !== item.rule) onSaveRule(rule);
    setEditing(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.evidence_snippet);
    } catch {
      /* clipboard can be blocked; copying is a convenience, not a feature */
    }
  };

  return (
    <div style={s.card(item.accepted)} data-testid="convention-card">
      <div style={s.main}>
        <div style={s.category}>{item.category}</div>
        {editing ? (
          <>
            <TextInput
              value={draft}
              onChange={setDraft}
              aria-label={t("card.ruleInput")}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div style={s.editRow}>
              <Button kind="primary" size="sm" icon="Check" onClick={save}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
            </div>
          </>
        ) : (
          <h3 style={s.rule}>{item.rule}</h3>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <MonoLink href={item.evidence_url}>
              {formatEvidenceRange(item.evidence_path, item.evidence_start, item.evidence_end)}
            </MonoLink>
            <button type="button" style={s.copy} onClick={copy} aria-label={t("card.copy")}>
              <Icon.Copy size={12} />
            </button>
          </div>
          <pre className="mono" style={s.code}>
            {item.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar
              value={item.confidence * 100}
              color={confidenceColor(item.confidence)}
              height={5}
            />
          </div>
          <span className="mono tnum" style={s.confidenceValue}>
            {confidencePercent(item.confidence)}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={item.accepted ? "primary" : "secondary"}
          size="sm"
          icon={item.accepted ? "Check" : "Plus"}
          full
          onClick={() => onToggleAccepted(!item.accepted)}
        >
          {item.accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" full onClick={onReject}>
          {t("card.reject")}
        </Button>
        <Button kind="ghost" size="sm" icon="Pencil" full onClick={startEdit}>
          {t("card.edit")}
        </Button>
      </div>
    </div>
  );
}
