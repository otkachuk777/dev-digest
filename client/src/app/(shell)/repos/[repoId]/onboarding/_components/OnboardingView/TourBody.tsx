"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Markdown } from "@devdigest/ui";
import type { Onboarding } from "@devdigest/shared";
import { githubBlobUrl } from "../../_lib/tour";
import { MermaidDiagram } from "../MermaidDiagram";
import { TourSection } from "../TourSection";
import { SECTION_KEYS, sectionId } from "./constants";
import { b } from "./bodyStyles";

/** "On this page" + the five sections. `copied` is the key of the command button that just copied. */
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
  const goTo = (key: (typeof SECTION_KEYS)[number]) => {
    const el = document.getElementById(sectionId(key));
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    critical: tour.critical_paths.length
      ? tour.critical_paths.map((p) => (
          <div key={p.path} style={b.row}>
            <div>
              <code className="mono">{p.path}</code>
              <div style={b.reason}>{p.reason}</div>
            </div>
            <Button size="sm" kind="ghost" onClick={() => open(p.path)}>
              {t("open")}
            </Button>
          </div>
        ))
      : empty,
    run: tour.how_to_run.length ? (
      <ol style={b.list}>
        {tour.how_to_run.map((c, i) => (
          <li key={i} style={b.row}>
            <div>
              <code className="mono">{c.command}</code>
              {c.comment && <div style={b.reason}>{c.comment}</div>}
              {c.cwd && <div style={b.reason}>{t("inCwd", { cwd: c.cwd })}</div>}
            </div>
            <Button
              size="sm"
              kind="ghost"
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
      <ol style={b.list}>
        {tour.reading_path.map((p) => (
          <li key={p.path} style={b.item}>
            <a href={url(p.path)} target="_blank" rel="noopener noreferrer" className="mono" style={b.link}>
              {p.path}
            </a>
            <div style={b.reason}>{p.reason}</div>
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
            <strong>{k.title}</strong>
            <code className="mono" style={b.reason}>
              {k.scope_path}
            </code>
            <Badge>{t(`complexity.${k.complexity}`)}</Badge>
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
    <div style={b.layout}>
      <nav aria-labelledby="onb-toc" style={b.toc}>
        <div id="onb-toc" style={b.tocLabel}>
          {t("toc")}
        </div>
        {SECTION_KEYS.map((k) => (
          <button key={k} type="button" style={b.tocItem} onClick={() => goTo(k)}>
            {t(`sections.${k}`)}
          </button>
        ))}
      </nav>
      <div>
        {SECTION_KEYS.map((k) => (
          <TourSection key={k} id={sectionId(k)} title={t(`sections.${k}`)}>
            {content[k]}
          </TourSection>
        ))}
      </div>
    </div>
  );
}
