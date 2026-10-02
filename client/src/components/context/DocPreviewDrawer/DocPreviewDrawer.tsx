"use client";

import { useTranslations } from "next-intl";
import { Badge, Checkbox, Drawer, Markdown } from "@devdigest/ui";
import { useContextDoc } from "@/lib/api/context";
import { s } from "./styles";

/** Read-only preview of one repo doc, with the same attach toggle as the list row. */
export function DocPreviewDrawer({
  repoId,
  path,
  attached,
  onToggleAttached,
  onClose,
}: {
  repoId: string;
  path: string;
  attached: boolean;
  onToggleAttached: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const doc = useContextDoc(repoId, path);
  return (
    <Drawer title={path} onClose={onClose}>
      <div style={s.toggle}>
        <Checkbox checked={attached} onChange={onToggleAttached} label={t("preview.attached")} />
      </div>
      {doc.isError ? (
        <p style={s.message}>{t("docNotFound")}</p>
      ) : doc.data ? (
        <>
          <div style={s.meta}>
            <Badge>{t(`type.${doc.data.type}`)}</Badge>
            <span>{t("tokens", { count: doc.data.tokens })}</span>
            <span>{t("usedBy", { agents: doc.data.used_by_agents, skills: doc.data.used_by_skills })}</span>
          </div>
          <Markdown noRemoteImages>{doc.data.content}</Markdown>
        </>
      ) : null}
    </Drawer>
  );
}
