import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { lineKind } from "./helpers";
import { diffLine, diffPreview, s, textarea } from "./styles";
import { fieldAria, type EvalCaseForm } from "./useEvalCaseForm";

/** Diff tab: textarea while editing, read-only styled preview otherwise. */
export function DiffPane({ form }: { form: EvalCaseForm }) {
  const t = useTranslations("eval");
  const { st, patch, editingDiff, setEditingDiff } = form;

  if (editingDiff) {
    return (
      <>
        <textarea
          className="mono"
          style={textarea}
          aria-label={t("modal.diffLabel")}
          spellCheck={false}
          value={st.diff}
          {...fieldAria(st.errors, "diff", "eval-diff-err")}
          onChange={(e) => patch({ diff: e.target.value })}
        />
        {st.diff !== "" && (
          <div style={s.diffBar}>
            <Button kind="ghost" size="sm" onClick={() => setEditingDiff(false)}>
              {t("modal.doneDiff")}
            </Button>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <div style={s.diffBar}>
        <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditingDiff(true)}>
          {t("modal.editDiff")}
        </Button>
      </div>
      {/* Read-only styled view; plain React text nodes, never HTML. */}
      <pre className="mono" style={diffPreview} aria-label={t("modal.diffPreview")}>
        {st.diff.split("\n").map((l, i) => (
          <div key={i} data-line={lineKind(l)} style={diffLine(l)}>
            {l || " "}
          </div>
        ))}
      </pre>
    </>
  );
}
