/* EvalCaseButton — "Turn into eval case" (SPEC-04). Owns its mutation; enabled once the finding is decided. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useCaseFromFinding } from "@/lib/api/eval";
import { notify } from "@/lib/toast";

export function EvalCaseButton({ f }: { f: FindingRecord }) {
  const t = useTranslations("eval");
  const create = useCaseFromFinding();
  const decided = !!(f.accepted_at || f.dismissed_at);
  const tip = !decided ? t("finding.tipUndecided") : f.accepted_at ? t("finding.tipAccepted") : t("finding.tipDismissed");
  const tipId = `eval-tip-${f.id}`;

  return (
    <>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || create.isPending}
        title={tip}
        aria-describedby={tipId}
        onClick={() =>
          create.mutate(f.id, {
            onSuccess: ({ created, case: c }) =>
              notify.success(created ? t("toast.caseCreated") : t("toast.caseExists"), {
                label: t("toast.openEvalsTab"),
                href: `/agents/${c.agent_id}?tab=evals`,
              }),
          })
        }
      >
        {t("finding.turnIntoCase")}
      </Button>
      <span id={tipId} hidden>
        {tip}
      </span>
    </>
  );
}
