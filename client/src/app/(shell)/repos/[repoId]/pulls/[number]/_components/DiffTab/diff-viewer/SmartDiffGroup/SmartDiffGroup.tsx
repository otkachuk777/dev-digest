/* SmartDiffGroup — one role-grouped section header (sticky) + its FileCards.
   Collapsed by default for low-signal roles (docs, boilerplate). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import { chevronFor } from "../styles";
import { ROLE_COLOR, ROLE_I18N, COLLAPSED_BY_DEFAULT } from "./constants";
import { s, headerStyle } from "./styles";

export function SmartDiffGroup({
  role,
  fileCount,
  filesWithFindings,
  children,
}: {
  role: SmartDiffRole;
  fileCount: number;
  filesWithFindings: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT.has(role));

  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={headerStyle()}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={{ ...s.swatch, background: ROLE_COLOR[role] }} />
        <span style={s.label}>{t(ROLE_I18N[role].label)}</span>
        <span style={s.hint}>{t(ROLE_I18N[role].hint)}</span>
        <span style={s.spacer} />
        {filesWithFindings > 0 && (
          <span style={s.findingsCount} title={t("smartDiff.filesWithFindings", { count: filesWithFindings })}>
            ● {filesWithFindings}
          </span>
        )}
        <span style={s.filesCount}>{t("smartDiff.filesCount", { count: fileCount })}</span>
      </button>
      {open && <div style={s.body}>{children}</div>}
    </div>
  );
}
