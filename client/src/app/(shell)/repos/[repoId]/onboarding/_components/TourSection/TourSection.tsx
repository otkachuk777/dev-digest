"use client";

import React from "react";
import { body, header, section } from "./styles";

/** Collapsible section; expanded on mount. The header button carries `id` so the TOC can focus it. */
export function TourSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  return (
    <section style={section}>
      <h2 style={{ margin: 0 }}>
        <button
          type="button"
          id={id}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((o) => !o)}
          style={header}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          {title}
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!open} style={body}>
        {children}
      </div>
    </section>
  );
}
