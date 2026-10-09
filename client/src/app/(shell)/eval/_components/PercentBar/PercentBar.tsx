import React from "react";
import { pct } from "@/lib/eval";
import { s } from "./styles";

/** Thin bar plus the percent; null (empty denominator) → empty bar and "—". */
export function PercentBar({ value, color }: { value: number | null; color: string }) {
  return (
    <div style={s.wrap}>
      <div style={s.track}>
        <div style={{ width: `${(value ?? 0) * 100}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span className="mono tnum" style={s.label}>
        {pct(value)}
      </span>
    </div>
  );
}
