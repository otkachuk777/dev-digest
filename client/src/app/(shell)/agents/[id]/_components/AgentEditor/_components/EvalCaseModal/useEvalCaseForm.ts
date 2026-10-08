import React from "react";
import { useTranslations } from "next-intl";
import { EvalCaseInput, type EvalCase, type EvalExpectationType } from "@devdigest/shared";
import { ApiError } from "@/lib/api/client";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/api/eval";
import { fieldGroup, filesInDiff, isJsonArray, seededBanner, type FieldGroup } from "./helpers";

interface FormState {
  name: string;
  type: EvalExpectationType;
  diff: string;
  title: string;
  body: string;
  expected: string;
}
export interface UiState extends FormState {
  runOnSave: boolean;
  tab: "diff" | "files" | "meta";
  file: string | null;
  errors: Partial<Record<FieldGroup, string>>;
}

const fromCase = (c: EvalCase | null): FormState => ({
  name: c?.name ?? "",
  type: c?.expectation_type ?? "must_find",
  diff: c?.input_diff ?? "",
  title: c?.input_meta.title ?? "",
  body: c?.input_meta.body ?? "",
  expected: c ? JSON.stringify(c.expected, null, 2) : "[]",
});
const FORM_KEYS = ["name", "type", "diff", "title", "body", "expected"] as const;

/** aria props tying a field to its inline error. */
export const fieldAria = (errors: UiState["errors"], g: FieldGroup, id: string) => ({
  "aria-invalid": !!errors[g],
  "aria-describedby": errors[g] ? id : undefined,
});

/** Form state, derived flags and submit (client validation + server-error mapping) of the eval case modal. */
export function useEvalCaseForm(evalCase: EvalCase | null, agentId: string, onClose: () => void) {
  const t = useTranslations("eval");
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase();
  const run = useRunEvalCase();
  const [initial] = React.useState(() => fromCase(evalCase));
  const [st, patch] = React.useReducer(
    (a: UiState, p: Partial<UiState>): UiState => ({ ...a, ...p }),
    { ...initial, runOnSave: true, tab: "diff", file: null, errors: {} },
  );
  const [pending, setPending] = React.useState(false);
  const [editingDiff, setEditingDiff] = React.useState(initial.diff === "");

  const files = filesInDiff(st.diff);
  const file = st.file && files.includes(st.file) ? st.file : files[0] ?? null;
  const dirty = FORM_KEYS.some((k) => st[k] !== initial[k]);
  const validJson = isJsonArray(st.expected);

  const submit = async () => {
    let expected: unknown;
    try {
      expected = JSON.parse(st.expected);
    } catch {
      return;
    }
    const parsed = EvalCaseInput.safeParse({
      name: st.name.trim(),
      ...(evalCase ? {} : { expectation_type: st.type }),
      expected,
      input_diff: st.diff,
      input_meta: { title: st.title, body: st.body },
    });
    if (!parsed.success) {
      const errors: UiState["errors"] = {};
      for (const i of parsed.error.issues) {
        const g = fieldGroup(i.path.join("."));
        errors[g] ??= g === "name" ? t("modal.nameRequired") : i.message;
      }
      return patch({ errors });
    }
    patch({ errors: {} });
    setPending(true);
    try {
      const saved = evalCase
        ? await update.mutateAsync({ id: evalCase.id, input: parsed.data })
        : await create.mutateAsync(parsed.data);
      if (st.runOnSave) run.mutate(saved.id);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_eval_case") {
        const field = (e.details as { field?: string } | undefined)?.field;
        patch({ errors: { [fieldGroup(field)]: e.message } });
      } else if (e instanceof ApiError && e.code === "duplicate_case_name") {
        patch({ errors: { name: t("modal.duplicateName", { name: st.name.trim() }) } });
      }
      // other errors: the global mutation toast already reports them
    } finally {
      setPending(false);
    }
  };

  return {
    st,
    patch,
    pending,
    editingDiff,
    setEditingDiff,
    files,
    file,
    validJson,
    canRun: !!evalCase && !dirty,
    seeded: evalCase ? seededBanner(evalCase) : null,
    negative: st.type === "must_not_flag",
    run,
    submit,
  };
}

export type EvalCaseForm = ReturnType<typeof useEvalCaseForm>;
