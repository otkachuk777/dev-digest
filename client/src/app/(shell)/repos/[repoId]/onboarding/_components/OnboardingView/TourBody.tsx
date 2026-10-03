"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown, MonoLink } from "@devdigest/ui";
import type { Onboarding } from "@devdigest/shared";
import { githubBlobUrl } from "../../_lib/tour";
import { MermaidDiagram } from "../MermaidDiagram";
import { TourSection } from "../TourSection";
import { COMPLEXITY_COLOR, SECTION_ICONS, SECTION_KEYS, sectionId } from "./constants";
import { b } from "./bodyStyles";

/** "On this page" column; clicking a title focuses and scrolls to that section. */
export function TourToc() {
  const t = useTranslations("onboarding");
  const [active, setActive] = React.useState<(typeof SECTION_KEYS)[number]>(SECTION_KEYS[0]);
  const goTo = (key: (typeof SECTION_KEYS)[number]) => {
    setActive(key);
    const el = document.getElementById(sectionId(key));
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <nav aria-labelledby="onb-toc" style={b.tocWrap}>
      <div style={b.toc}>
        <div id="onb-toc" style={b.tocLabel}>
          {t("toc")}
        </div>
        {SECTION_KEYS.map((k) => (
          <button key={k} type="button" style={b.tocItem(k === active)} onClick={() => goTo(k)}>
            {t(`sections.${k}`)}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** The five sections. `copied` is the key of the command button that just copied. */
export function TourBody({
  tour,
  copied,
  onCopy,
}: {
  tour: Onboarding;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const t = useTranslations("onboarding");
  const url = (path: string) => githubBlobUrl(tour.repo_full_name, tour.commit_sha, path);
  const open = (path: string) => window.open(url(path), "_blank", "noopener,noreferrer");
  const empty = <p style={b.empty}>{t("nothing")}</p>;
  const content: Record<(typeof SECTION_KEYS)[number], React.ReactNode> = {
    architecture:
      tour.architecture.body || tour.architecture.diagram ? (
        <>
          <Markdown noRemoteImages>{tour.architecture.body}</Markdown>
          {tour.architecture.diagram && <MermaidDiagram chart={tour.architecture.diagram} label={t("diagramAlt")} />}
        </>
      ) : (
        empty
      ),
    critical: tour.critical_paths.length ? (
      <div style={b.stack}>
        {tour.critical_paths.map((p) => (
          <div key={p.path} style={b.pathRow}>
            <Icon.FileText size={13} style={b.icon} />
            <code className="mono">
              <MonoLink href={url(p.path)}>{p.path}</MonoLink>
            </code>
            <span style={b.pathReason}>— {p.reason}</span>
            <Button size="sm" kind="ghost" onClick={() => open(p.path)}>
              {t("open")}
            </Button>
          </div>
        ))}
      </div>
    ) : (
      empty
    ),
    run: tour.how_to_run.length ? (
      <ol style={b.cmdList}>
        {tour.how_to_run.map((c, i) => (
          <li key={i} style={b.cmdRow}>
            <span className="tnum" style={b.cmdNum}>
              {i + 1}
            </span>
            <div style={b.cmdText}>
              <code className="mono" style={b.cmd}>
                {c.command}
              </code>
              {c.comment && (
                <span className="mono" style={b.cmdMuted}>
                  <span aria-hidden="true"># </span>
                  <span>{c.comment}</span>
                </span>
              )}
              {c.cwd && <span style={b.cwd}>{t("inCwd", { cwd: c.cwd })}</span>}
            </div>
            <Button
              size="sm"
              kind="tertiary"
              icon={copied === `cmd-${i}` ? "Check" : "Copy"}
              aria-label={t("copyCommand", { command: c.command })}
              onClick={() => onCopy(c.command, `cmd-${i}`)}
            >
              {copied === `cmd-${i}` ? t("copied") : null}
            </Button>
          </li>
        ))}
      </ol>
    ) : (
      empty
    ),
    reading: tour.reading_path.length ? (
      <ol style={b.readList}>
        {tour.reading_path.map((p, i) => (
          <li key={p.path} style={b.readItem}>
            <span className="tnum" style={b.readNum} aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <MonoLink href={url(p.path)}>{p.path}</MonoLink>
              <div style={b.readReason}>{p.reason}</div>
            </div>
          </li>
        ))}
      </ol>
    ) : (
      empty
    ),
    tasks: tour.first_tasks.length ? (
      <div style={b.cards}>
        {tour.first_tasks.map((k) => (
          <div key={`${k.title}|${k.scope_path}`} style={b.card}>
            <div style={b.cardTitle}>{k.title}</div>
            <code className="mono" style={b.cardScope}>
              {k.scope_path}
            </code>
            <Badge color={COMPLEXITY_COLOR[k.complexity]} bg="transparent" style={b.badge}>
              {t(`complexity.${k.complexity}`)}
            </Badge>
          </div>
        ))}
      </div>
    ) : tour.status === "skeleton" ? (
      <p style={b.empty}>{t("tasksSkeleton")}</p>
    ) : (
      empty
    ),
  };

  return (
    <>
      {SECTION_KEYS.map((k) => (
        <TourSection key={k} id={sectionId(k)} title={t(`sections.${k}`)} icon={SECTION_ICONS[k]}>
          {content[k]}
        </TourSection>
      ))}
    </>
  );
}
