import type { IconName } from "@devdigest/ui";
import type { RiskKind, RiskSeverity } from "@devdigest/shared";

export const RISK_ICON: Record<RiskKind, IconName> = {
  security: "Shield",
  db_migration: "Database",
  breaking_api: "AlertTriangle",
  perf: "Zap",
  deps: "Layers",
  other: "Info",
};

export const RISK_SEV_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};
