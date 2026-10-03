"use client";

import type { Onboarding } from "@devdigest/shared";
import { useBannerLines } from "./helpers";
import { banner } from "./styles";

/** One line saying how the tour was produced, plus one line per degradation note. */
export function StatusBanner({ tour }: { tour: Onboarding }) {
  return (
    <div style={banner}>
      {useBannerLines(tour).map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
