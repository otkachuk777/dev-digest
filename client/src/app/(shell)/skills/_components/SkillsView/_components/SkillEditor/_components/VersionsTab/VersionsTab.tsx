/* VersionsTab — immutable body snapshots, newest first, current one badged.
   Each older version can be diffed against the current body or restored as a new version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/api/skills";
import { useToast } from "@/lib/toast";
import { lineDiff } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skillId, currentVersion }: { skillId: string; currentVersion: number }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skillId);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<number | null>(null);

  // Diff of the open version against the current one. Memoised: it is an O(n·m) table,
  // and unrelated re-renders (restore pending, toasts) must not recompute it.
  const diffLines = React.useMemo(() => {
    const open = versions?.find((v) => v.version === diffOf);
    const cur = versions?.find((v) => v.version === currentVersion);
    return open && cur ? lineDiff(open.body, cur.body) : [];
  }, [versions, diffOf, currentVersion]);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (isError) return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;

  const sorted = [...(versions ?? [])].sort((a, b) => b.version - a.version);
  const current = sorted.find((v) => v.version === currentVersion);

  return (
    <div style={s.wrap}>
      {sorted.length === 0 && <div style={s.empty}>{t("versions.empty")}</div>}
      {sorted.map((v) => {
        const isCurrent = v.version === currentVersion;
        const showDiff = diffOf === v.version && current;
        return (
          <React.Fragment key={v.version}>
            <div style={s.row}>
              <Badge mono>{t("preview.version", { version: v.version })}</Badge>
              <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
              {isCurrent ? (
                <Badge color="var(--ok)">{t("versions.current")}</Badge>
              ) : (
                <div style={s.actions}>
                  <Button
                    kind="ghost"
                    size="sm"
                    icon="GitCommit"
                    onClick={() => setDiffOf(diffOf === v.version ? null : v.version)}
                  >
                    {diffOf === v.version ? t("versions.hideDiff") : t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(
                        { id: skillId, version: v.version },
                        {
                          onSuccess: (skill) =>
                            toast.success(t("versions.restoredToast", { from: v.version, to: skill.version })),
                        },
                      )
                    }
                  >
                    {t("versions.restore")}
                  </Button>
                </div>
              )}
            </div>
            {showDiff && (
              <div style={s.diff} data-testid={`diff-v${v.version}`}>
                <div style={s.diffTitle}>{t("versions.diffTitle", { version: v.version })}</div>
                {diffLines.every((l) => l.type === "same") ? (
                  <div style={s.diffTitle}>{t("versions.noChanges")}</div>
                ) : (
                  <pre className="mono" style={{ margin: 0, padding: "6px 0" }}>
                    {diffLines.map((l, i) => (
                      <code key={i} data-type={l.type} style={s.diffLine(l.type)}>
                        {l.type === "add" ? "+ " : l.type === "del" ? "- " : "  "}
                        {l.text}
                      </code>
                    ))}
                  </pre>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
