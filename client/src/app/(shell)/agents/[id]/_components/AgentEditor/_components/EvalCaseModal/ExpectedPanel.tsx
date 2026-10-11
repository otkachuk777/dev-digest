import { useTranslations } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import { Badge, Button, Icon } from "@devdigest/ui";
import { formatCost } from "@/lib/format";
import { FieldError } from "./FieldError";
import { appendSkeleton } from "./helpers";
import { expectedArea, s } from "./styles";
import { fieldAria, type EvalCaseForm } from "./useEvalCaseForm";

/** Right half of the modal: expected-output JSON editor and the last run's result. */
export function ExpectedPanel({ form, evalCase }: { form: EvalCaseForm; evalCase: EvalCase | null }) {
  const t = useTranslations("eval");
  const { st, patch, negative, validJson } = form;
  const last = evalCase?.last_result ?? null;

  return (
    <div style={s.right}>
      <div style={s.expectedHead}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>
          {negative ? t("modal.expectedNegative") : t("modal.expected")}
        </span>
        <Badge color={validJson ? "var(--ok)" : "var(--crit)"} bg={validJson ? "var(--ok-bg)" : "var(--crit-bg)"} icon={validJson ? "Check" : "AlertTriangle"}>
          {validJson ? t("modal.validJson") : t("modal.invalidJson")}
        </Badge>
        <div style={{ marginLeft: "auto" }}>
          <Button kind="ghost" size="sm" onClick={() => patch({ expected: appendSkeleton(st.expected, st.diff) })}>
            {t("modal.skeleton")}
          </Button>
        </div>
      </div>
      <div style={s.expectedBox}>
        <textarea
          className="mono"
          style={expectedArea}
          aria-label={t("modal.expected")}
          spellCheck={false}
          value={st.expected}
          {...fieldAria(st.errors, "expected", "eval-expected-err")}
          onChange={(e) => patch({ expected: e.target.value })}
        />
      </div>
      <FieldError id="eval-expected-err" message={st.errors.expected} />
      {last && (
        <div style={s.last}>
          {last.status === "pass" ? <Icon.CheckCircle size={16} style={{ color: "var(--ok)" }} /> : last.status === "fail" ? <Icon.XCircle size={16} style={{ color: "var(--crit)" }} /> : <Icon.AlertTriangle size={16} style={{ color: "var(--warn)" }} />}
          <span>
            {last.status === "error" ? (
              t("modal.lastErrored", { reason: last.error ?? "" })
            ) : (
              <>
                <b style={{ color: "var(--text-primary)" }}>{last.status === "pass" ? t("modal.lastPassed") : t("modal.lastFailed")}</b>
                {" · "}
                {t("modal.lastDetail", {
                  n: last.expected_count,
                  m: last.matched_count,
                  seconds: (last.duration_ms / 1000).toFixed(1),
                  cost: formatCost(last.cost_usd),
                })}
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
