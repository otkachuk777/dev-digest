import { useTranslations } from "next-intl";
import { fileSection } from "./helpers";
import { fileBtn, s } from "./styles";
import type { EvalCaseForm } from "./useEvalCaseForm";

/** Files tab: the diff's paths and the selected file's part. */
export function FilesPane({ form }: { form: EvalCaseForm }) {
  const t = useTranslations("eval");
  const { st, patch, files, file } = form;

  if (files.length === 0) return <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{t("modal.noFiles")}</div>;
  return (
    <div style={s.filesWrap}>
      <div style={s.filesList}>
        {files.map((f) => (
          <button key={f} className="mono" style={fileBtn(f === file)} onClick={() => patch({ file: f })}>
            {f}
          </button>
        ))}
      </div>
      <pre className="mono" style={{ ...s.pre, flex: 1, minWidth: 0 }}>
        {file ? fileSection(st.diff, file) : ""}
      </pre>
    </div>
  );
}
