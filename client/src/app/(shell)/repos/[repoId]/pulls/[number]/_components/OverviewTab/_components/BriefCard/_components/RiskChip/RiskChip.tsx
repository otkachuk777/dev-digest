/* RiskChip — kind icon + severity colour + title + first ref; the chevron toggles the explanation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RISK_ICON, RISK_SEV_COLOR } from "../../constants";
import { s } from "./styles";

export function RiskChip({
  risk,
  expanded,
  onToggle,
  onGoto,
}: {
  risk: Risk;
  expanded: boolean;
  onToggle: () => void;
  /** Navigate to the first line of a ref (title and ref list share this). */
  onGoto: (ref: string) => void;
}) {
  const t = useTranslations("brief.card");
  const KindIcon = Icon[RISK_ICON[risk.kind]];
  const color = RISK_SEV_COLOR[risk.severity];
  const firstRef = risk.file_refs[0] ?? "";
  return (
    <div style={s.chip(expanded ? color : "var(--border)", expanded)}>
      <button type="button" style={s.go} onClick={() => onGoto(firstRef)}>
        <span style={s.titleRow}>
          <span role="img" aria-label={t(`risks.severity.${risk.severity}`)} style={{ display: "inline-flex", color }}>
            <KindIcon size={13} />
          </span>
          {risk.title}
        </span>
        <span className="mono" style={s.ref}>
          {firstRef}
        </span>
      </button>
      <button
        type="button"
        style={s.toggle}
        aria-expanded={expanded}
        aria-label={t("risks.why", { title: risk.title })}
        onClick={onToggle}
      >
        <Icon.ChevronDown size={14} style={s.chevron(expanded)} />
      </button>
    </div>
  );
}
