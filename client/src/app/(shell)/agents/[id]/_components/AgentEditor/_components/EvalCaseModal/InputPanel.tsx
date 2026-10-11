import { useTranslations } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import { Badge, Button, FormField, Icon, Tabs, TextInput } from "@devdigest/ui";
import { DiffPane } from "./DiffPane";
import { FieldError } from "./FieldError";
import { FilesPane } from "./FilesPane";
import { banner, s, textarea } from "./styles";
import { fieldAria, type EvalCaseForm, type UiState } from "./useEvalCaseForm";

/** Left half of the modal: seeded banner, name, type and the Input tabs (diff / files / PR meta). */
export function InputPanel({ form, evalCase }: { form: EvalCaseForm; evalCase: EvalCase | null }) {
  const t = useTranslations("eval");
  const { st, patch, seeded, negative } = form;

  return (
    <div style={s.left}>
      {seeded && (
        <div style={banner(seeded.positive)}>
          {seeded.positive ? <Icon.Target size={15} /> : <Icon.XCircle size={15} />}
          <span>
            <b style={{ textTransform: "uppercase", fontSize: 10.5, marginRight: 7 }}>
              {seeded.positive ? t("modal.positive") : t("modal.negative")}
            </b>
            {seeded.positive
              ? t("modal.positiveText", { title: seeded.title, file: seeded.file, lines: seeded.lines })
              : t("modal.negativeText", { title: seeded.title, file: seeded.file, lines: seeded.lines })}
          </span>
        </div>
      )}
      <div style={s.pad}>
        <FormField label={t("modal.name")} required>
          <TextInput
            mono
            value={st.name}
            aria-label={t("modal.name")}
            {...fieldAria(st.errors, "name", "eval-name-err")}
            onChange={(v) => patch({ name: v })}
          />
          <FieldError id="eval-name-err" message={st.errors.name} />
        </FormField>
        <div style={s.label}>{t("modal.type")}</div>
        {evalCase ? (
          <div style={{ marginBottom: 14 }}>
            <Badge>{negative ? t("modal.mustNotFlag") : t("modal.mustFind")}</Badge>
          </div>
        ) : (
          <div style={{ ...s.typeRow, marginBottom: 14 }}>
            {(["must_find", "must_not_flag"] as const).map((k) => (
              <Button key={k} kind="tertiary" size="sm" active={st.type === k} aria-pressed={st.type === k} onClick={() => patch({ type: k })}>
                {k === "must_find" ? t("modal.mustFind") : t("modal.mustNotFlag")}
              </Button>
            ))}
          </div>
        )}
        <div style={s.label}>{t("modal.input")}</div>
      </div>
      <Tabs
        tabs={[
          { key: "diff", label: t("modal.tabs.diff") },
          { key: "files", label: t("modal.tabs.files") },
          { key: "meta", label: t("modal.tabs.meta") },
        ]}
        value={st.tab}
        onChange={(k) => patch({ tab: k as UiState["tab"] })}
        pad="0 16px"
      />
      <FieldError id="eval-diff-err" message={st.errors.diff} />
      <FieldError id="eval-meta-err" message={st.errors.meta} />
      <div style={s.tabBody}>
        {st.tab === "diff" && <DiffPane form={form} />}
        {st.tab === "files" && <FilesPane form={form} />}
        {st.tab === "meta" && (
          <div>
            <FormField label={t("modal.prTitle")}>
              <TextInput value={st.title} aria-label={t("modal.prTitle")} onChange={(v) => patch({ title: v })} />
            </FormField>
            <FormField label={t("modal.prBody")}>
              <textarea
                style={{ ...textarea, minHeight: 120, fontSize: 14 }}
                aria-label={t("modal.prBody")}
                value={st.body}
                onChange={(e) => patch({ body: e.target.value })}
              />
            </FormField>
          </div>
        )}
      </div>
    </div>
  );
}
