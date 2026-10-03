"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { body, chevron, header, heading, section, tile, title as titleStyle } from "./styles";

/** Collapsible section; expanded on mount. The header button carries `id` so the TOC can focus it. */
export function TourSection({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const Ico = Icon[icon];
  return (
    <section style={section}>
      <h2 style={heading}>
        <button
          type="button"
          id={id}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((o) => !o)}
          style={header}
        >
          <span style={tile} aria-hidden="true">
            <Ico size={15} />
          </span>
          <span style={titleStyle}>{title}</span>
          <Icon.ChevronDown size={16} style={chevron(open)} aria-hidden="true" />
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!open} style={body}>
        {children}
      </div>
    </section>
  );
}
