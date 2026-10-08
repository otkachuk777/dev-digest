/* AgentEditor — basic agent config editor (model + system prompt). Later
   lessons add Skills/Evals/Stats/CI tabs; the Part-0 starter ships Config only.
   Tab state still lives in ?tab= for forward-compatibility. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextTab } from "@/components/context/ContextTab";
import { useActiveRepo } from "@/lib/repo-context";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { EvalsTab } from "./_components/EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const te = useTranslations("eval");
  const { activeRepo } = useActiveRepo();
  const tabs = TABS.map((tb) => ({ key: tb.key, label: tb.ns === "eval" ? te(tb.labelKey) : t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* Remount on agent switch instead of an effect-driven state reset
            inside the tab bodies — see ConfigTab.tsx. */}
        {tab === "skills" ? (
          <SkillsTab key={agent.id} agentId={agent.id} />
        ) : tab === "evals" ? (
          <EvalsTab key={agent.id} agentId={agent.id} agentName={agent.name} />
        ) : tab === "context" ? (
          <ContextTab
            key={agent.id}
            owner={{ kind: "agent", id: agent.id }}
            repoId={activeRepo?.id ?? null}
            repoName={activeRepo?.full_name ?? ""}
          />
        ) : (
          <ConfigTab key={agent.id} agent={agent} />
        )}
      </div>
    </div>
  );
}
