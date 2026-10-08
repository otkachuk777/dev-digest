import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under `ns` (default `agents`). */
export interface EditorTab {
  key: string;
  ns?: "eval";
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Part-0 shipped Config only; later lessons add the rest. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "evals", ns: "eval", labelKey: "tab.label", icon: "Gauge" },
];
